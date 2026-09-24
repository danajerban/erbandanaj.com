import { useLoader } from "@react-three/fiber";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three-stdlib";

// drei's useGLTF, minus the Draco path: every model is meshopt-compressed
// (EXT_meshopt_compression), so the Draco decoder is neither hosted nor
// referenced. r3f's useLoader adds the gltfjsx-style `nodes`/`materials` graph.
const extensions = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);

export const useGLTF = (path) => useLoader(GLTFLoader, path, extensions);
useGLTF.preload = (path) => useLoader.preload(GLTFLoader, path, extensions);
