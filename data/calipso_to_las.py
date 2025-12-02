#!/usr/bin/env python3
"""
Convert CALIPSO Level 1 HDF files to LAS format for COPC conversion.

This script extracts point cloud data from CALIPSO satellite lidar HDF files:
- Latitude, Longitude, Altitude coordinates
- Total Attenuated Backscatter at 532nm and 1064nm
"""

from pyhdf.SD import SD, SDC
import numpy as np
import laspy
from pathlib import Path
import sys


def get_calipso_altitudes(n_bins=583):
    """
    Generate CALIPSO Level 1 altitude array.

    CALIPSO Level 1B data uses 583 altitude bins spanning -2.0 to 40.0 km
    with variable vertical resolution across 5 altitude regions:
    - Region 1: -2.0 to -0.5 km (300m resolution, 5 bins)
    - Region 2: -0.5 to 8.3 km (30m resolution, 290 bins) - Troposphere
    - Region 3: 8.3 to 20.2 km (60m resolution, 200 bins) - Upper Trop/Lower Strat
    - Region 4: 20.2 to 30.1 km (180m resolution, 55 bins) - Stratosphere
    - Region 5: 30.1 to 40.0 km (300m resolution, 33 bins) - Upper Stratosphere

    Note: This implementation uses a linear approximation for simplicity.
    For precise altitude values, consider implementing the actual variable-resolution
    CALIPSO altitude grid as documented in CALIPSO DPC Rev 5.00.

    Args:
        n_bins: Number of altitude bins (default 583)

    Returns:
        1D numpy array of altitudes in km

    References:
        CALIPSO Data Products Catalog, NASA LaRC ASDC
        https://www-calipso.larc.nasa.gov/resources/calipso_users_guide/
    """
    # Linear approximation of CALIPSO altitude grid
    # Corrected to match official range: -2.0 to 40.0 km (was -0.5 to 40.0)
    altitudes = np.linspace(-2.0, 40.0, n_bins)
    return altitudes


def read_calipso_hdf(hdf_path):
    """
    Read CALIPSO Level 1 HDF4 file and extract point cloud data.

    Args:
        hdf_path: Path to CALIPSO HDF file

    Returns:
        Dictionary with lat, lon, altitudes, backscatter_532, backscatter_1064, profile_time
    """
    print(f"Reading {hdf_path}...")

    # Open HDF4 file
    hdf = SD(str(hdf_path), SDC.READ)

    try:
        # Extract latitude and longitude (profile-level data)
        lat_ds = hdf.select('Latitude')
        lon_ds = hdf.select('Longitude')

        lat = lat_ds.get().flatten()
        lon = lon_ds.get().flatten()

        # Extract time data (TAI seconds since 1993-01-01 00:00:00)
        profile_time_ds = hdf.select('Profile_Time')
        profile_time = profile_time_ds.get().flatten()

        # Extract backscatter data
        # These are 2D arrays: [profiles, altitudes]
        bs532_ds = hdf.select('Total_Attenuated_Backscatter_532')
        bs1064_ds = hdf.select('Attenuated_Backscatter_1064')

        backscatter_532 = bs532_ds.get()
        backscatter_1064 = bs1064_ds.get()

        # Get number of altitude bins from data shape
        n_profiles, n_altitudes = backscatter_532.shape

        # Generate standard CALIPSO altitude array
        altitudes = get_calipso_altitudes(n_altitudes)

        print(f"Profiles: {n_profiles}")
        print(f"Altitude bins: {n_altitudes}")
        print(f"Latitude shape: {lat.shape}")
        print(f"Longitude shape: {lon.shape}")
        print(f"Profile time range: {profile_time.min():.2f} to {profile_time.max():.2f} seconds (TAI)")
        print(f"Altitudes range: {altitudes.min():.2f} to {altitudes.max():.2f} km")
        print(f"Backscatter 532 shape: {backscatter_532.shape}")
        print(f"Backscatter 1064 shape: {backscatter_1064.shape}")

    finally:
        hdf.end()

    return {
        'lat': lat,
        'lon': lon,
        'altitudes': altitudes,
        'backscatter_532': backscatter_532,
        'backscatter_1064': backscatter_1064,
        'profile_time': profile_time
    }


def create_point_cloud(data):
    """
    Create point cloud arrays from CALIPSO data.

    CALIPSO data is organized as profiles (along-track) vs altitudes (vertical).
    This expands the 2D structure into a 1D point cloud.

    Args:
        data: Dictionary from read_calipso_hdf

    Returns:
        Dictionary with 1D arrays of x, y, z, intensity_532, intensity_1064, gps_time
    """
    lat = data['lat']
    lon = data['lon']
    altitudes = data['altitudes']
    backscatter_532 = data['backscatter_532']
    backscatter_1064 = data['backscatter_1064']
    profile_time = data['profile_time']

    n_profiles = len(lat)
    n_altitudes = len(altitudes)
    n_points = n_profiles * n_altitudes

    print(f"Creating point cloud with {n_points:,} points...")
    print(f"  Profiles: {n_profiles}")
    print(f"  Altitudes per profile: {n_altitudes}")

    # Create coordinate arrays
    # Repeat lat/lon/time for each altitude, repeat altitudes for each profile
    lats = np.repeat(lat, n_altitudes)
    lons = np.repeat(lon, n_altitudes)
    alts = np.tile(altitudes, n_profiles)
    times = np.repeat(profile_time, n_altitudes)

    # Flatten backscatter arrays
    bs_532 = backscatter_532.flatten()
    bs_1064 = backscatter_1064.flatten()

    # Mask invalid values
    # CALIPSO uses -9999 for missing data and has valid ranges per documentation:
    # 532nm: -0.1 to 3.3 (1/(km·sr))
    # 1064nm: -0.04 to 2.5 (1/(km·sr))
    # Apply filters with small margins to exclude noisy/saturated measurements
    valid_mask = (
        (bs_532 > -0.2) & (bs_532 < 3.5) &  # CALIPSO valid range: -0.1 to 3.3 (with margin)
        (bs_1064 > -0.1) & (bs_1064 < 2.6) &  # CALIPSO valid range: -0.04 to 2.5 (with margin)
        np.isfinite(bs_532) & np.isfinite(bs_1064)
    )

    print(f"Valid points after filtering: {np.sum(valid_mask):,} ({100*np.sum(valid_mask)/len(valid_mask):.1f}%)")

    return {
        'lon': lons[valid_mask],
        'lat': lats[valid_mask],
        'alt': alts[valid_mask],
        'intensity_532': bs_532[valid_mask],
        'intensity_1064': bs_1064[valid_mask],
        'gps_time': times[valid_mask]
    }


def write_las(point_cloud, output_path):
    """
    Write point cloud to LAS file.

    Args:
        point_cloud: Dictionary with lon, lat, alt, intensity, gps_time arrays
        output_path: Path for output LAS file
    """
    print(f"Writing LAS file to {output_path}...")

    # Create LAS file with point format 6 (LAS 1.4, no RGB, supports extra bytes)
    # This avoids the "unutilized RGB bytes" warning
    header = laspy.LasHeader(point_format=6, version="1.4")

    # Calculate bounds with some padding to avoid out-of-bounds issues
    min_x, max_x = point_cloud['lon'].min(), point_cloud['lon'].max()
    min_y, max_y = point_cloud['lat'].min(), point_cloud['lat'].max()
    min_z, max_z = point_cloud['alt'].min(), point_cloud['alt'].max()

    # Set offsets to minimum values
    header.offsets = np.array([min_x, min_y, min_z])

    # Set scales for proper precision while fitting in 32-bit integer range
    # For geographic coordinates: 0.0001° ≈ 11m at equator (sufficient for CALIPSO's ~333m resolution)
    # For altitude: 0.001 km = 1m vertical resolution
    header.scales = np.array([0.0001, 0.0001, 0.001])

    # Add custom dimensions for BOTH backscatter wavelengths (preserve original scientific units)
    # Note: LAS description field limited to 32 characters
    header.add_extra_dim(laspy.ExtraBytesParams(
        name="backscatter_532",
        type=np.float64,
        description="Backscatter 532nm [km-1 sr-1]"
    ))
    header.add_extra_dim(laspy.ExtraBytesParams(
        name="backscatter_1064",
        type=np.float64,
        description="Backscatter 1064nm [km-1 sr-1]"
    ))

    las = laspy.LasData(header)

    # Set coordinates
    las.x = point_cloud['lon']
    las.y = point_cloud['lat']
    las.z = point_cloud['alt']

    # Set GPS time (TAI seconds since 1993-01-01 00:00:00 UTC)
    # CALIPSO Profile_Time is in TAI (International Atomic Time) seconds
    # Note: TAI is ahead of GPS time by ~19 seconds and ahead of UTC by leap seconds
    las.gps_time = point_cloud['gps_time']
    print(f"GPS time range: {point_cloud['gps_time'].min():.2f} to {point_cloud['gps_time'].max():.2f} (TAI seconds)")

    # Set return numbers (CALIPSO is profiling lidar with single returns)
    # This is required for proper COPC validation
    n_points = len(point_cloud['lon'])
    las.return_number = np.ones(n_points, dtype=np.uint8)
    las.number_of_returns = np.ones(n_points, dtype=np.uint8)

    # Normalize backscatter to 16-bit intensity range for compatibility with standard viewers
    # CALIPSO backscatter values are in 1/(km·sr) units, typically -0.1 to 3.3
    # Scale to 0-65535 range for LAS intensity
    # Use a multiplier that maps typical values (0-2) to mid-range intensity
    bs_532_scaled = np.clip((point_cloud['intensity_532'] + 0.1) * 10000, 0, 65535).astype(np.uint16)
    las.intensity = bs_532_scaled

    # Store BOTH backscatter wavelengths in extra dimensions (keep original values in scientific units)
    las.backscatter_532 = point_cloud['intensity_532']   # Original 532nm values
    las.backscatter_1064 = point_cloud['intensity_1064']  # Original 1064nm values

    # Set coordinate reference system (WGS84) using VLR
    try:
        from pyproj import CRS
        las.add_crs(CRS.from_epsg(4326), VLR=True)
    except:
        # Fallback: manually set CRS in header
        # EPSG:4326 is WGS84
        pass

    las.write(output_path)
    print(f"Successfully wrote {len(las.points):,} points to {output_path}")
    print(f"  ✅ backscatter_532:  {point_cloud['intensity_532'].min():.6f} to {point_cloud['intensity_532'].max():.6f} km⁻¹·sr⁻¹")
    print(f"  ✅ backscatter_1064: {point_cloud['intensity_1064'].min():.6f} to {point_cloud['intensity_1064'].max():.6f} km⁻¹·sr⁻¹")


def convert_calipso_to_las(hdf_path, output_path=None, lon_min=None, lon_max=None, lat_min=None, lat_max=None):
    """
    Convert CALIPSO HDF file to LAS format.

    Args:
        hdf_path: Path to input HDF file
        output_path: Optional output path. If None, uses same name with .las extension
        lon_min: Optional minimum longitude filter (degrees)
        lon_max: Optional maximum longitude filter (degrees)
        lat_min: Optional minimum latitude filter (degrees)
        lat_max: Optional maximum latitude filter (degrees)
    """
    hdf_path = Path(hdf_path)

    if output_path is None:
        output_path = hdf_path.with_suffix('.las')
    else:
        output_path = Path(output_path)

    # Read HDF data
    data = read_calipso_hdf(hdf_path)

    # Create point cloud
    point_cloud = create_point_cloud(data)

    # Apply spatial filters if specified
    mask = np.ones(len(point_cloud['lon']), dtype=bool)
    filter_applied = False

    if lon_min is not None or lon_max is not None:
        if lon_min is not None:
            mask &= (point_cloud['lon'] >= lon_min)
        if lon_max is not None:
            mask &= (point_cloud['lon'] <= lon_max)
        filter_applied = True

    if lat_min is not None or lat_max is not None:
        if lat_min is not None:
            mask &= (point_cloud['lat'] >= lat_min)
        if lat_max is not None:
            mask &= (point_cloud['lat'] <= lat_max)
        filter_applied = True

    if filter_applied:
        n_before = len(point_cloud['lon'])
        n_after = np.sum(mask)
        filter_desc = []
        if lon_min is not None or lon_max is not None:
            filter_desc.append(f"lon:[{lon_min},{lon_max}]")
        if lat_min is not None or lat_max is not None:
            filter_desc.append(f"lat:[{lat_min},{lat_max}]")
        print(f"Spatial filter {' '.join(filter_desc)}: keeping {n_after:,} / {n_before:,} points ({100*n_after/n_before:.1f}%)")

        if n_after == 0:
            raise ValueError(f"No points remain after filtering. Check filter bounds.")

        # Filter all arrays
        point_cloud = {
            'lon': point_cloud['lon'][mask],
            'lat': point_cloud['lat'][mask],
            'alt': point_cloud['alt'][mask],
            'intensity_532': point_cloud['intensity_532'][mask],
            'intensity_1064': point_cloud['intensity_1064'][mask],
            'gps_time': point_cloud['gps_time'][mask]
        }

    # Write LAS file
    write_las(point_cloud, output_path)

    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python calipso_to_las.py <input.hdf> [output.las]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        output = convert_calipso_to_las(input_file, output_file)
        print(f"\nConversion complete! Output: {output}")
    except Exception as e:
        print(f"Error during conversion: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
