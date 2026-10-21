import { useScroll } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { motion, useReducedMotion } from "motion/react";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { ANIMATION_CONSTANTS } from "../constants/animation";
import { projectAtom } from "../store";

// Card entrance: fade in and rise, once per page load (viewport `once`, no
// storage). The rise is on the cards themselves — never on `.projects`, whose
// CSS translateX an inline motion transform would override. A section's
// cards are staggered by the shared constant via the container's variant.
const groupVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: ANIMATION_CONSTANTS.CARD_STAGGER_DELAY } },
};
const cardVariants = {
  hidden: { opacity: 0, y: ANIMATION_CONSTANTS.CARD_RISE_PX },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIMATION_CONSTANTS.CARD_ENTRANCE_DURATION, ease: "easeOut" },
  },
};
// Reduced motion: fade only. Motion would snap `y` anyway, but cards that have
// not entered the viewport yet would still sit 12 px down in their hidden state.
const cardVariantsReduced = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: ANIMATION_CONSTANTS.CARD_ENTRANCE_DURATION, ease: "easeOut" },
  },
};

// Phone carousels (Skills, Projects): one card at a time, snapped to the
// centre (CSS scroll snap), with dots underneath. The active card is read
// from the scroll position at most once per frame while the carousel moves,
// and state changes only when the index does.
const useCarousel = (enabled, onChange) => {
  const ref = useRef(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const [first, second] = el.children;
      if (!second) return;
      const step = second.offsetLeft - first.offsetLeft;
      const last = el.children.length - 1;
      const index = Math.min(last, Math.max(0, Math.round(el.scrollLeft / step)));
      if (index !== activeRef.current) {
        activeRef.current = index;
        setActive(index);
        onChange?.(index);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [enabled, onChange]);
  return { ref, active };
};

// Dot i brings card i to the centre; the snap keeps it there.
const CarouselDots = ({ carousel, count, label, reduceMotion }) => {
  const goTo = (index) => {
    const el = carousel.ref.current;
    const card = el?.children[index];
    if (!card) return;
    const box = el.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    // scrollTo, not scrollBy: a scroll with a direction stops at the first
    // card on the way (scroll-snap-stop: always), a position does not
    el.scrollTo({
      left:
        el.scrollLeft + cardBox.left + cardBox.width / 2 - (box.left + box.width / 2),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };
  return (
    <div className="carousel__dots" role="group" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className="carousel__dot"
          aria-label={`Card ${i + 1} of ${count}`}
          aria-current={i === carousel.active ? "true" : undefined}
          onClick={() => goTo(i)}
        />
      ))}
    </div>
  );
};

export const Interface = ({ revealed }) => {
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
  const reduceMotion = useReducedMotion();
  const cardEntrance = reduceMotion ? cardVariantsReduced : cardVariants;
  const skillsCarousel = useCarousel(isMobile);
  // Phones: the card snapped to the centre is the one on the desk monitor
  const showProject = useCallback(
    (index) => setProject(config.projects[index]),
    [setProject],
  );
  const projectsCarousel = useCarousel(isMobile, showProject);
  // Mobile: the section is only "in view" once its top 70% has scrolled past.
  const viewport = { once: true, margin: isMobile ? "-70% 0px 0px 0px" : undefined };
  return (
    <div className="interface">
      <div className="sections">
        {/* HOME */}
        <section className="section section--bottom">
          <h2 className="sr-only">Home</h2>
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
          <h2 className="sr-only">Skills</h2>
          <div className="carousel">
            <motion.div
              ref={skillsCarousel.ref}
              className="skills"
              role="region"
              aria-label="Skills"
              tabIndex={isMobile ? 0 : undefined}
              initial="hidden"
              whileInView="visible"
              variants={groupVariants}
              viewport={viewport}
            >
              {config.skills.map((skill, idx) => (
                <motion.div
                  key={skill.name + idx}
                  className="skill"
                  variants={cardEntrance}
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
            {isMobile && (
              <CarouselDots
                carousel={skillsCarousel}
                count={config.skills.length}
                label="Skill cards"
                reduceMotion={reduceMotion}
              />
            )}
          </div>
        </section>
        {/* PROJECTS */}
        <section className="section section--left mobile--section--bottom">
          <h2 className="sr-only">Projects</h2>
          <div className="carousel">
            <motion.div
              ref={projectsCarousel.ref}
              className="projects"
              initial="hidden"
              whileInView="visible"
              variants={groupVariants}
              viewport={viewport}
            >
              {config.projects.map((project, idx) => (
                <motion.div
                  {...(!isMobile && {
                    onPointerEnter: () => setProject(project),
                    onPointerLeave: () => setProject(config.projects[0]),
                    onFocus: () => setProject(project),
                    onBlur: () => setProject(config.projects[0]),
                  })}
                  key={project.name + idx}
                  className="project"
                  variants={cardEntrance}
                >
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${project.name} - ${project.description}`}
                  >
                    {/* Lazy until the scene is visible (the screenshots must not
                        compete with the Home gate on the network), then eager so
                        they download, decode and rasterise while the visitor is
                        idle at Home — not mid-scroll, where a lazy image
                        crossing the load margin cost frames over 50 ms. Phones
                        show the site's icon instead and never fetch a screenshot
                        for the card (the desk monitor shows it). */}
                    {!isMobile && (
                      <img
                        className="project__image"
                        src={project.image}
                        alt={project.name}
                        crossOrigin="anonymous"
                        loading={revealed ? "eager" : "lazy"}
                        decoding="async"
                      />
                    )}
                    <div className="project__details">
                      {isMobile ? (
                        <div className="project__label">
                          <img className="project__label__icon" src={project.icon} alt="" />
                          <h2 className="project__details__name">{project.name}</h2>
                        </div>
                      ) : (
                        <h2 className="project__details__name">{project.name}</h2>
                      )}
                      <p className="project__details__description">
                        {project.description}
                      </p>
                    </div>
                  </a>
                </motion.div>
              ))}
            </motion.div>
            {isMobile && (
              <CarouselDots
                carousel={projectsCarousel}
                count={config.projects.length}
                label="Project cards"
                reduceMotion={reduceMotion}
              />
            )}
          </div>
        </section>
        {/* CONTACT */}
        <section className="section section--left section--contact mobile--section--bottom">
          <h2 className="sr-only">Contact</h2>
          <motion.div
            className="contact"
            initial="hidden"
            whileInView="visible"
            variants={cardEntrance}
            viewport={{ once: true }}
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
                  src="/icons/linkedin.png"
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
                  src="/icons/github.png"
                  alt="GitHub"
                />
              </a>
              <a href={`mailto:${config.contact.mail}`} aria-label="Send email">
                <img
                  className="contact__socials__icon"
                  src="/icons/gmail.png"
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
                  src="/icons/cv.png"
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
