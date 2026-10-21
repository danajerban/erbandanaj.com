import { Text3D } from "@react-three/drei";
import { useMobile } from "../contexts/MobileContext";

// Sun letters: a light peach face (a tint of the sunset sun) over the sun's
// own coral on the sides. Only the caps (face and back) have normals along
// z — the walls and the bevel stay under 0.3 — so the shader paints the rest
// coral by the object-space normal, and lets only the caps glow (the glow
// lifts the face above the pale sky; the walls keep their shading and read
// as its outline), in one draw (a material per
// TextGeometry group would draw every glyph twice). Passed as constructor
// parameters (args): one object, so one program for every title, under a
// stable key.
const SUN = {
  onBeforeCompile: (shader) => {
    shader.vertexShader = `varying float vCap;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      "$&\nvCap = abs(normal.z);",
    )}`;
    // The sides: the sun's coral #ff7753; the caps' glow: its #ff7a56 at 0.6
    // (both linear)
    shader.fragmentShader = `varying float vCap;\n${shader.fragmentShader.replace(
      "#include <color_fragment>",
      "$&\nfloat cap = step(.99,vCap);\ndiffuseColor.rgb = mix(vec3(1.,.184,.087), diffuseColor.rgb, cap);",
    ).replace("#include <emissivemap_fragment>", "$&\ntotalEmissiveRadiance += cap * vec3(.6,.117,.056);")}`;
  },
  customProgramCacheKey: () => "section-title-sun",
};

// color tints the face; envMapIntensity dims the sunset light on the whole
// title (both uniforms, so any title keeps the one program)
export const SectionTitle = ({ children, color = "#ffdcb4", envMapIntensity = 1, ...props }) => {
  const { isMobile } = useMobile();
  return (
    <Text3D font={"/fonts/Inter_Bold.json"} size={0.3} {...props}>
      {children}
      {/* MOBILE_PERF: the smoother title surface is desktop only — revert by removing the ternary */}
      <meshStandardMaterial args={[SUN]} color={color} envMapIntensity={envMapIntensity} roughness={isMobile ? 1 : 0.7} />
    </Text3D>
  );
};
