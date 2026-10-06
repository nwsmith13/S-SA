import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const openCvArtifactPath = fileURLToPath(new URL('./node_modules/@techstark/opencv-js/dist/opencv.js', import.meta.url));
const openCvArtifact = readFileSync(openCvArtifactPath);
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        {
            name: 'opencv-browser-artifact',
            configureServer(server) {
                server.middlewares.use('/opencv.js', (_request, response) => {
                    response.statusCode = 200;
                    response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
                    response.end(openCvArtifact);
                });
            },
            generateBundle() {
                this.emitFile({ type: 'asset', fileName: 'opencv.js', source: openCvArtifact });
            },
        },
    ],
});
