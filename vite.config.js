import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Particle-ecosystem/",
  plugins: [react()],
  server: {
    // Allow the host that was blocked in the error message
    allowedHosts: ["d7hkk3-5173.csb.app"],
  },
});
