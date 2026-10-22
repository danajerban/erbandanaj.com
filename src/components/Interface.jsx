import { useScroll } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { motion, useReducedMotion } from "motion/react";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { MathUtils } from "three";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { ANIMATION_CONSTANTS } from "../constants/animation";
import { projectAtom } from "../store";

// Card entrance: fade in and rise, once per page load (no storage), when
// the section's fade with its room first passes ENTER_AT (useSectionFades):
// the visitor sees it, it never plays under a faded-out section. The rise is on the cards themselves — never on `.projects`, whose
// CSS translateX an inline motion transform would override. A section's
// cards are staggered by the shared constant via the container's variant. The
// entrance animates `--enter`, which the card's CSS opacity multiplies with
// its section's `--fade` (below).
const groupVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: ANIMATION_CONSTANTS.CARD_STAGGER_DELAY } },
};
const cardVariants = {
  hidden: { "--enter": 0, y: ANIMATION_CONSTANTS.CARD_RISE_PX },
  visible: {
    "--enter": 1,
    y: 0,
    transition: { duration: ANIMATION_CONSTANTS.CARD_ENTRANCE_DURATION, ease: "easeOut" },
  },
};
// Reduced motion: fade only. Motion would snap `y` anyway, but cards whose
// section has not faded in yet (ENTER_AT) would still sit CARD_RISE_PX down in
// their hidden state.
const cardVariantsReduced = {
  hidden: { "--enter": 0 },
  visible: {
    "--enter": 1,
    transition: { duration: ANIMATION_CONSTANTS.CARD_ENTRANCE_DURATION, ease: "easeOut" },
  },
};

// The cards leave with their room: a section's cards fade on the same curve,
// from the same scroll position, as its 3D group dissolves into the haze
// (SectionGroup). The fade is a `--fade` variable on the section, which each
// card's own opacity multiplies (index.css): an opacity on an ancestor would
// switch off the cards' backdrop blur. Written only when its step changes;
// at 0 the section is hidden and inert, so its cards take no tap or focus.
// It also returns which sections have entered: one state change per section
// per page load.
const FADE_STEPS = 40;
const ENTER_AT = 0.5;
const FADED_SECTIONS = ["skills", "projects", "contact"];
const useSectionFades = (scrollData) => {
  const refs = useRef([]);
  const fades = useRef(FADED_SECTIONS.map(() => 1));
  const enteredRef = useRef(FADED_SECTIONS.map(() => false));
  const [entered, setEntered] = useState(enteredRef.current);
  useFrame(() => {
    const position = scrollData.offset * (scrollData.pages - 1);
    FADED_SECTIONS.forEach((name, i) => {
      const away = Math.abs(position - config.sections.indexOf(name));
      const fade =
        Math.round(
          (1 -
            MathUtils.smoothstep(
              away,
              ANIMATION_CONSTANTS.DISSOLVE_START,
              ANIMATION_CONSTANTS.DISSOLVE_END,
            )) *
            FADE_STEPS,
        ) / FADE_STEPS;
      if (fade >= ENTER_AT && !enteredRef.current[i]) {
        enteredRef.current = enteredRef.current.map((e, j) => e || j === i);
        setEntered(enteredRef.current);
      }
      const el = refs.current[i];
      if (!el || fade === fades.current[i]) return;
      el.style.setProperty("--fade", fade);
      if ((fade === 0) !== (fades.current[i] === 0)) {
        el.style.visibility = fade === 0 ? "hidden" : "";
        el.inert = fade === 0;
      }
      fades.current[i] = fade;
    });
  });
  const fadeRef = (i) => (el) => {
    refs.current[i] = el;
  };
  return { fadeRef, sectionRefs: refs, entered };
};

// Desktop: the skill column scrolls up under the menu pill and the project
// column under the logo while their room is still fading. Each card fades
// out as its top crosses that band: a third factor on its opacity, `--pass`,
// on the card itself like `--fade`. A card never fades at rest (its band
// ends at or above its own resting top). Card tops are read from the layout
// only when a column or the menu changes size; along the scroll they follow
// from the scroll position. Written only when its step changes.
const PASS_STEPS = 20;
const PASS_PX = 64;
// Each column's section by name: its place in FADED_SECTIONS (the faded
// section elements) and in config.sections (the scroll pages)
const PASS_COLUMNS = [
  { name: "skills", column: ".skills", card: ".skill", band: ".menu__buttons" },
  { name: "projects", column: ".projects", card: ".project", band: ".menu__logo" },
].map((row) => ({
  ...row,
  fadeIndex: FADED_SECTIONS.indexOf(row.name),
  pageIndex: config.sections.indexOf(row.name),
}));
// Layout position in the page, transforms (the scroll, the card entrance) left out
const layoutTop = (el) => {
  let top = 0;
  for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
  return top;
};
const useMenuPass = (scrollData, sectionRefs, enabled) => {
  const cards = useRef([]);
  const dirty = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    const measure = () => {
      dirty.current = true;
    };
    // A height change re-centres a column without resizing it
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    for (const { fadeIndex, column, band } of PASS_COLUMNS) {
      const el = sectionRefs.current[fadeIndex]?.querySelector(column);
      if (el) observer.observe(el);
      const menu = document.querySelector(band);
      if (menu) observer.observe(menu);
    }
    dirty.current = true;
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
      for (const card of cards.current) card.el.style.removeProperty("--pass");
      cards.current = [];
    };
  }, [enabled, sectionRefs]);
  useFrame((state) => {
    if (!enabled) return;
    if (dirty.current) {
      dirty.current = false;
      for (const card of cards.current) card.el.style.removeProperty("--pass");
      cards.current = PASS_COLUMNS.flatMap(({ fadeIndex, pageIndex, card, band }) => {
        const el = sectionRefs.current[fadeIndex];
        const bandBottom = document.querySelector(band)?.getBoundingClientRect().bottom;
        if (!el || bandBottom == null) return [];
        const sectionTop = layoutTop(el);
        return [...el.querySelectorAll(card)].map((cardEl) => {
          const rest = layoutTop(cardEl) - sectionTop;
          return { el: cardEl, pageIndex, rest, band: Math.min(bandBottom, rest), pass: 1 };
        });
      });
    }
    const position = scrollData.offset * (scrollData.pages - 1);
    const height = state.size.height;
    for (const card of cards.current) {
      const top = (card.pageIndex - position) * height + card.rest;
      const pass =
        Math.round(MathUtils.smoothstep(top, card.band - PASS_PX, card.band) * PASS_STEPS) /
        PASS_STEPS;
      if (pass === card.pass) continue;
      card.el.style.setProperty("--pass", pass);
      card.pass = pass;
    }
  });
};

// The section a hash link lands on (#skills, #projects, #contact). Its icons
// load with the scene, so they show as soon as it does; every other icon
// waits for the reveal, so it never competes with the scene's models on a
// slow connection. Each icon's box is sized in CSS, so nothing shifts.
const landingSection = (() => {
  const hash = window.location.hash.slice(1);
  return FADED_SECTIONS.includes(hash) ? hash : null;
})();

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
    // Turned back on (a tablet rotated through the desktop grid): the scroll
    // position may have moved without a scroll event
    read();
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
  const { fadeRef, sectionRefs, entered } = useSectionFades(scrollData);
  const [shownProject, setProject] = useAtom(projectAtom);
  const { isMobile } = useMobile();
  useMenuPass(scrollData, sectionRefs, !isMobile);
  const reduceMotion = useReducedMotion();
  const cardEntrance = reduceMotion ? cardVariantsReduced : cardVariants;
  const skillsCarousel = useCarousel(isMobile);
  // Phones: the card snapped to the centre is the one on the desk monitor
  const showProject = useCallback(
    (index) => setProject(config.projects[index]),
    [setProject],
  );
  const projectsCarousel = useCarousel(isMobile, showProject);
  const entrance = (i) => (entered[i] ? "visible" : "hidden");
  const iconSrc = (section, src) =>
    revealed || section === landingSection ? src : undefined;
  return (
    <div className="interface">
      <div className="sections">
        {/* HOME */}
        <section className="section section--bottom">
          <h2 className="sr-only">Home</h2>
          <motion.div
            className="scroll-down"
            aria-hidden="true"
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
        <section
          ref={fadeRef(0)}
          className="section section--right mobile--section--left mobile--section--bottom"
        >
          <h2 className="sr-only">Skills</h2>
          <div className="carousel">
            <motion.div
              ref={skillsCarousel.ref}
              className="skills"
              role="region"
              aria-label="Skills"
              tabIndex={isMobile ? 0 : undefined}
              initial="hidden"
              animate={entrance(0)}
              variants={groupVariants}
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
                      src={iconSrc("skills", skill.icon)}
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
        <section ref={fadeRef(1)} className="section section--left mobile--section--bottom">
          <h2 className="sr-only">Projects</h2>
          <div className="carousel">
            <motion.div
              ref={projectsCarousel.ref}
              className="projects"
              role="region"
              aria-label="Projects"
              tabIndex={isMobile ? 0 : undefined}
              initial="hidden"
              animate={entrance(1)}
              variants={groupVariants}
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
                  className={
                    !isMobile && project === shownProject
                      ? "project project--on-monitor"
                      : "project"
                  }
                  variants={cardEntrance}
                >
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${project.name} - ${project.description}`}
                  >
                    {/* The site's icon, name and description; no screenshot
                        on the card, the desk monitor shows it */}
                    <div className="project__details">
                      <div className="project__label">
                        <img
                          className="project__label__icon"
                          src={iconSrc("projects", project.icon)}
                          alt=""
                        />
                        <h2 className="project__details__name">{project.name}</h2>
                      </div>
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
        <section
          ref={fadeRef(2)}
          className="section section--left section--contact mobile--section--bottom"
        >
          <h2 className="sr-only">Contact</h2>
          <motion.div
            className="contact"
            initial="hidden"
            animate={entrance(2)}
            variants={cardEntrance}
          >
            <p className="contact__eyebrow">Get in touch</p>
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
                  src={iconSrc("contact", "/icons/linkedin.png")}
                  alt=""
                />
                <span className="contact__socials__label">LinkedIn</span>
              </a>
              <a
                href={config.contact.socials.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub profile"
              >
                <img
                  className="contact__socials__icon"
                  src={iconSrc("contact", "/icons/github.png")}
                  alt=""
                />
                <span className="contact__socials__label">GitHub</span>
              </a>
              <a href={`mailto:${config.contact.mail}`} aria-label="Send email">
                <img
                  className="contact__socials__icon"
                  src={iconSrc("contact", "/icons/gmail.png")}
                  alt=""
                />
                <span className="contact__socials__label">Email</span>
              </a>
              <a
                href="/Erban Danaj - Software Engineer.pdf"
                download="Erban-Danaj-Software-Engineer.pdf"
                aria-label="Download CV as PDF"
              >
                <img
                  className="contact__socials__icon"
                  src={iconSrc("contact", "/icons/cv.png")}
                  alt=""
                />
                <span className="contact__socials__label">CV</span>
              </a>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
};
