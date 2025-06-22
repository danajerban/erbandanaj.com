export const Menu = () => {
  return (
    <div className="menu">
      <a href="#home">
        <img className="menu__logo" src="logo.png" alt="logo" />
      </a>
      <div className="menu__buttons">
        <a className="menu__button" href="#home">
          Home
        </a>
        <a className="menu__button" href="#skills">
          Skills
        </a>
        <a className="menu__button" href="#projects">
          Projects
        </a>
        <a className="menu__button" href="#contact">
          Contact
        </a>
        <a
          className="menu__button"
          href="/Erban Danaj - Software Engineer.pdf"
          download="Erban Danaj - Software Engineer"
        >
          CV
        </a>
      </div>
    </div>
  );
};
