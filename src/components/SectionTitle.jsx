import { Text3D } from "@react-three/drei";
import { useMobile } from "../contexts/MobileContext";

// Sand letters: a golden-sand face (the beach's own tone) over deeper tan
// sides, with a fine grain. Only the caps (face and back) have normals along
// z — the walls and the bevel stay under 0.3 — so the shader deepens the rest
// to tan by the object-space normal, in one draw (a material per
// TextGeometry group would draw every glyph twice). The grain is one random
// shade per 1/70-unit cell of the object-space position, faded out as a cell
// shrinks toward a pixel, so a small or distant title stays clean. Passed as
// constructor parameters (args): one object, so one program for every title,
// under a stable key.
const SAND = {
  onBeforeCompile: (shader) => {
    shader.vertexShader = `varying vec4 vSand;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      "$&\nvSand = vec4(position, abs(normal.z));",
    )}`;
    shader.fragmentShader = `varying vec4 vSand;\n${shader.fragmentShader.replace(
      "#include <color_fragment>",
      "$&\nvec3 grain = vSand.xyz * 70.;\ndiffuseColor.rgb *= mix(vec3(.55,.45,.33), vec3(1), step(.99,vSand.w)) * (1.-.1*rand(floor(grain.xy+grain.z))*saturate(2.-2.*length(fwidth(grain))));",
    )}`;
  },
  customProgramCacheKey: () => "section-title-sand",
};

export const SectionTitle = ({ children, ...props }) => {
  const { isMobile } = useMobile();
  return (
    <Text3D font={"/fonts/Inter_Bold.json"} size={0.3} {...props}>
      {children}
      {/* MOBILE_PERF: the smoother title surface is desktop only — revert by removing the ternary */}
      <meshStandardMaterial args={[SAND]} color="#efc07a" roughness={isMobile ? 1 : 0.7} />
    </Text3D>
  );
};
