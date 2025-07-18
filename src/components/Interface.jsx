import { useScroll } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";
import { atom, useAtom } from "jotai";
import { useState } from "react";
import { config } from "../config";
import { useMobile } from "../hooks/useMobile";

export const projectAtom = atom(config.projects[0]);
export const Interface = () => {
  const scrollData = useScroll();
  const [hasScrolled, setHasScrolled] = useState(false);
  useFrame(() => {
    setHasScrolled(scrollData.offset > 0); // its either true or false because normally we dont use state in useFrame to avoid re-renders
  });
  const [_project, setProject] = useAtom(projectAtom);
  const { isMobile } = useMobile();
  return (
    <div className="interface">
      <div className="sections">
        {/* HOME */}
        <section className="section section--bottom">
          <motion.div
            className="scroll-down"
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: hasScrolled ? 0 : 1,
            }}
          >
            <motion.div
              className="scroll-down__wheel"
              initial={{
                translateY: 0,
              }}
              animate={{
                translateY: 4,
              }}
              transition={{
                duration: 0.4,
                repeatDelay: 0.5,
                repeatType: "reverse",
                repeat: Infinity,
              }}
            ></motion.div>
          </motion.div>
        </section>
        {/* SKILLS */}
        <section className="section section--right mobile--section--left mobile--section--bottom">
          <motion.div
            className="skills"
            whileInView={"visible"}
            initial={{
              opacity: 0,
            }}
            variants={{
              visible: {
                opacity: 1,
              },
            }}
            viewport={{
              margin: isMobile ? "-70% 0px 0px 0px" : undefined,
            }}
          >
            {config.skills.map((skill, idx) => (
              <motion.div
                key={skill.name + idx}
                className="skill"
                initial={{ opacity: 0 }}
                variants={{
                  visible: {
                    opacity: 1,
                  },
                }}
                transition={{
                  duration: 1,
                  delay: isMobile ? 0 : idx * 0.62,
                }}
              >
                <div className="skill__label">
                  <img
                    className="skill__label__image"
                    src={skill.icon}
                    alt={skill.name}
                  />
                  <h2 className="skill__label__name">{skill.name}</h2>
                </div>
                <p className="skill__subtitle">{skill.subtitle}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>
        {/* PROJECTS */}
        <section className="section section--left mobile--section--bottom">
          <motion.div
            className="projects"
            whileInView={"visible"}
            initial={{
              opacity: 0,
            }}
            variants={{
              visible: {
                opacity: 1,
              },
            }}
            viewport={{
              margin: isMobile ? "-70% 0px 0px 0px" : undefined,
            }}
          >
            {config.projects.map((project, idx) => (
              <motion.div
                onMouseEnter={() => setProject(project)}
                key={project.name + idx}
                className="project"
                initial={{ opacity: 0 }}
                variants={{
                  visible: {
                    opacity: 1,
                  },
                }}
                transition={{
                  duration: 1,
                  delay: isMobile ? 0 : idx * 0.5,
                }}
              >
                <a href={project.link} target="_blank">
                  <img
                    className="project__image"
                    src={project.image}
                    alt={project.name}
                  />
                  <div className="project__details">
                    <h2 className="project__details__name">{project.name}</h2>
                    <p className="project__details__description">
                      {project.description}
                    </p>
                  </div>
                </a>
              </motion.div>
            ))}
          </motion.div>
        </section>
        {/* CONTACT */}
        <section className="section section--left mobile--section--bottom">
          <motion.div
            className="contact"
            whileInView={"visible"}
            initial={{
              opacity: 0,
            }}
            variants={{
              visible: {
                opacity: 1,
              },
            }}
          >
            <h1 className="contact__name">{config.contact.name}</h1>
            <p className="contact__address">{config.contact.address}</p>
            <div className="contact__socials">
              <a href={config.contact.socials.linkedin} target="_blank">
                <img
                  className="contact__socials__icon"
                  src="icons/linkedin.png"
                  alt="linkedin"
                />
              </a>
              <a href={config.contact.socials.github} target="_blank">
                <img
                  className="contact__socials__icon"
                  src="icons/github.png"
                  alt="github"
                />
              </a>
              <a href={`mailto:${config.contact.mail}`} target="_blank">
                <img
                  className="contact__socials__icon"
                  src="icons/gmail.png"
                  alt="email"
                />
              </a>
              <a href="/Erban Danaj - Software Engineer.pdf" download="Erban Danaj - Software Engineer">
                <img
                  className="contact__socials__icon"
                  src="icons/cv.png"
                  alt="Download CV"
                />
              </a>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
};
