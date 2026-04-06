import { useScroll } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";
import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { ANIMATION_CONSTANTS } from "../constants/animation";
import { projectAtom } from "../store";

export const Interface = () => {
  const scrollData = useScroll();
  const [hasScrolled, setHasScrolled] = useState(false);
  const hasScrolledRef = useRef(false);
  useFrame(() => {
    const newHasScrolled = scrollData.offset > 0;
    if (newHasScrolled !== hasScrolledRef.current) {
      hasScrolledRef.current = newHasScrolled;
      setHasScrolled(newHasScrolled);
    }
  });
  const setProject = useSetAtom(projectAtom);
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
                  delay: isMobile ? 0 : idx * ANIMATION_CONSTANTS.SKILL_STAGGER_DELAY,
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
                onPointerEnter={() => setProject(project)}
                onPointerLeave={() => setProject(config.projects[0])}
                onFocus={() => setProject(project)}
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
                  delay: isMobile ? 0 : idx * ANIMATION_CONSTANTS.PROJECT_STAGGER_DELAY,
                }}
              >
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${project.name} - ${project.description}`}
                >
                  <img
                    className="project__image"
                    src={project.image}
                    alt={project.name}
                    loading="lazy"
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
              <a
                href={config.contact.socials.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn profile"
              >
                <img
                  className="contact__socials__icon"
                  src="icons/linkedin.png"
                  alt="LinkedIn"
                />
              </a>
              <a
                href={config.contact.socials.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub profile"
              >
                <img
                  className="contact__socials__icon"
                  src="icons/github.png"
                  alt="GitHub"
                />
              </a>
              <a href={`mailto:${config.contact.mail}`} aria-label="Send email">
                <img
                  className="contact__socials__icon"
                  src="icons/gmail.png"
                  alt="Email"
                />
              </a>
              <a
                href="/Erban Danaj - Software Engineer.pdf"
                download="Erban-Danaj-Software-Engineer.pdf"
                aria-label="Download CV as PDF"
              >
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
