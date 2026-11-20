import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  // Inicio de sesión de los usuarios (Managed Better Auth)
  auth: true,
  // API HTTP para la web estática (GitHub Pages); los permisos los aplica RLS (sql/1_base_de_datos.sql)
  dataApi: { authProvider: "neon" },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
