import js from "@eslint/js";
import reactThree from "@react-three/eslint-plugin";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    settings: { react: { version: "detect" } },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      // Ships no flat config (and bundles ESLint 8) — its two rules are
      // registered by hand, same severity as its old `recommended` preset.
      "@react-three": reactThree,
    },
    rules: {
      // The two classic hooks rules only. The plugin's v7 `recommended` also
      // enables the React Compiler rules, which reject deliberate R3F patterns
      // here (mutating drei's scroll state in the resync effect).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "warn",
      "@react-three/no-clone-in-loop": "error",
      "@react-three/no-new-in-loop": "error",
      "react/prop-types": "off",
      "react/no-unknown-property": [
        "error",
        {
          ignore: [
            "args",
            "attach",
            "dispose",
            "geometry",
            "map",
            "material",
            "morphTargetDictionary",
            "morphTargetInfluences",
            "object",
            "position",
            "position-x",
            "position-y",
            "position-z",
            "rotation",
            "rotation-x",
            "rotation-y",
            "rotation-z",
            "scale-x",
            "scale-y",
            "scale-z",
            "skeleton",
            "castShadow",
            "receiveShadow",
            "intensity",
            "opacity",
            "transparent",
            "roughness",
            "metalness",
            "toneMapped",
            "depthWrite",
            "wireframe",
            "side",
            "penumbra",
            "decay",
            "distance",
            "angle",
            "color",
          ],
        },
      ],
    },
  },
];
