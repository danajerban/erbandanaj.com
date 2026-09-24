import { useAtomValue } from "jotai";
import { config } from "../config";
import { sectionAtom } from "../store";

// Clicking an anchor whose hash is already in the URL fires no native
// hashchange event, so re-dispatch one to re-trigger the scroll listener
// in Experience.jsx (it reads window.location.hash, not the event payload).
const handleSectionClick = (event) => {
  if (window.location.hash === event.currentTarget.hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
};

// Link ids come from config.sections, the same list sectionAtom indexes into,
// so the active indicator and the anchors cannot drift apart.
const SECTION_LABELS = { home: "Home", skills: "Skills", projects: "Projects", contact: "Contact" };
const SECTION_LINKS = config.sections.map((id) => [id, SECTION_LABELS[id]]);

export const Menu = () => {
  const sectionIndex = useAtomValue(sectionAtom);
  return (
    <div className="menu">
      <a href="#home" onClick={handleSectionClick}>
        <img
          className="menu__logo"
          src="/logos/logo.svg"
          alt="Erban Danaj"
        />
      </a>
      {/* Glass behind the links once the visitor has left Home (index >= 1) */}
      <div className={`menu__buttons${sectionIndex >= 1 ? " menu__buttons--glass" : ""}`}>
        {SECTION_LINKS.map(([id, label], index) => {
          const active = index === sectionIndex;
          return (
            <a
              key={id}
              className={`menu__button${active ? " menu__button--active" : ""}`}
              href={`#${id}`}
              aria-current={active ? "true" : undefined}
              onClick={handleSectionClick}
            >
              {label}
            </a>
          );
        })}
        <a
          className="menu__button"
          href="/Erban Danaj - Software Engineer.pdf"
          download="Erban-Danaj-Software-Engineer.pdf"
        >
          CV
        </a>
      </div>
    </div>
  );
};
