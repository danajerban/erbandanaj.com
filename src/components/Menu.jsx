// Clicking an anchor whose hash is already in the URL fires no native
// hashchange event, so re-dispatch one to re-trigger the scroll listener
// in Experience.jsx (it reads window.location.hash, not the event payload).
const handleSectionClick = (event) => {
  if (window.location.hash === event.currentTarget.hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
};

export const Menu = () => {
  return (
    <div className="menu">
      <a href="#home" onClick={handleSectionClick}>
        <img
          className="menu__logo"
          src="/logos/logo.svg"
          alt="Erban Danaj"
        />
      </a>
      <div className="menu__buttons">
        <a className="menu__button" href="#home" onClick={handleSectionClick}>
          Home
        </a>
        <a className="menu__button" href="#skills" onClick={handleSectionClick}>
          Skills
        </a>
        <a
          className="menu__button"
          href="#projects"
          onClick={handleSectionClick}
        >
          Projects
        </a>
        <a
          className="menu__button"
          href="#contact"
          onClick={handleSectionClick}
        >
          Contact
        </a>
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
