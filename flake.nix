{
  description = "Dev shell for obsidian-digital-garden (Obsidian plugin, esbuild + npm)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          # CI (.github/workflows/actions.yml) pins node via .nvmrc (20.6.0) and
          # uses npm. Node 20 hit upstream EOL and was dropped from nixpkgs, so
          # this shell uses nodejs_22 (next LTS) instead; it bundles npm. bun is
          # included too since the repo also ships a bun.lockb.
          packages = [
            pkgs.nodejs_22
            pkgs.bun
          ];

          shellHook = ''
            echo "obsidian-digital-garden devshell: $(node --version) / npm $(npm --version) / $(bun --version)"
          '';
        };
      });
}
