import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Include specific modules
      protocolImports: true,
    }),
    // Custom plugin to handle HTTP range requests for COPC files and WASM MIME types
    {
      name: 'range-request-handler',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Handle WASM files with correct MIME type
          if (req.url?.endsWith('.wasm')) {
            // Try multiple possible WASM file locations
            const urlPath = req.url.replace(/^\//, '')
            const possiblePaths = [
              path.join(server.config.root, 'node_modules', urlPath),
              path.join(server.config.root, 'public', urlPath),
              path.join(server.config.root, urlPath)
            ]

            for (const wasmPath of possiblePaths) {
              if (fs.existsSync(wasmPath)) {
                res.setHeader('Content-Type', 'application/wasm')
                res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
                res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
                fs.createReadStream(wasmPath).pipe(res)
                return
              }
            }
          }

          if (req.url?.includes('.copc.laz') || req.url?.includes('.laz') || req.url?.includes('.las')) {
            const rangeHeader = req.headers.range
            if (!rangeHeader) {
              return next()
            }

            // Extract file path from URL
            const urlPath = req.url.split('?')[0]

            // Try multiple possible file locations
            let filePath: string
            if (urlPath.startsWith('/data/final/tiled')) {
              // Direct path to data/final/tiled directory (outside public)
              filePath = path.join(server.config.root, urlPath)
            } else {
              // Default: look in public directory
              filePath = path.join(server.config.root, 'public', urlPath)
            }

            // Check if file exists
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404
              res.end('File not found')
              return
            }

            const stat = fs.statSync(filePath)
            const fileSize = stat.size

            // Parse range header (format: "bytes=start-end")
            const parts = rangeHeader.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

            // Validate range
            if (start >= fileSize || end >= fileSize) {
              res.statusCode = 416
              res.setHeader('Content-Range', `bytes */${fileSize}`)
              res.end()
              return
            }

            const chunkSize = end - start + 1
            const fileStream = fs.createReadStream(filePath, { start, end })

            // Set response headers for partial content
            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Content-Length', chunkSize)
            res.setHeader('Content-Type', 'application/octet-stream')

            fileStream.pipe(res)
            return
          }
          next()
        })
      }
    }
  ],
  server: {
    port: 3002,
    open: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Accept-Ranges': 'bytes',
    },
    fs: {
      allow: ['..']
    }
  },
  publicDir: 'public',
  assetsInclude: ['**/*.laz', '**/*.copc.laz', '**/*.las', '**/*.wasm'],
  optimizeDeps: {
    include: ['laz-perf'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    }
  }
})
