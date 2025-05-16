import { useState } from "react";
import { useScroll } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";

export const Interface = () => {
  const [hasScrolled, setHasScrolled] = useState(false);
  const scrollData = useScroll();

  useFrame(() => {
    setHasScrolled(scrollData.offset > 0);
  }); // its either true or false because normally we dont use state in useFrame to avoid re-renders

  return (
    <div className="interface">
      <div className="sections">
        {/* HOME */}
        <section className="section section--bottom">
          <motion.div
            className="scroll-down"
            initial={{ opacity: 0 }}
            animate={{ opacity: hasScrolled ? 0 : 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="scroll-down__wheel"
              initial={{ translateY: 0 }}
              animate={{ translateY: 4 }}
              transition={{
                duration: 0.4,
                repeatDelay: 0.5,
                repeat: Infinity,
                repeatType: "reverse",
              }}
            ></motion.div>
          </motion.div>
        </section>
        {/* SKILLS */}
        <section className="section section--right mobile--section--left mobile--section--bottom">
          SKILLS
        </section>
        {/* PROJECTS */}
        <section className="section section--left mobile--section--bottom">
          PROJECTS
        </section>
        {/* CONTACT */}
        <section className="section section--left mobile--section--bottom">
          CONTACT
        </section>
      </div>
    </div>
  );
};
