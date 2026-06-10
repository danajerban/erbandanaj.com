export const config = {
  title: "Erban Danaj",
  sections: ["home", "skills", "projects", "contact"],
  home: {
    title: "ErbanDanaj",
  },
  skills: [
    {
      name: "Frontend Development",
      subtitle: "React, Next.js, TypeScript, Redux, WebSockets/Socket.io, SEO",
      icon: "icons/typescript.png",
    },
    {
      name: "Backend Development",
      subtitle:
        "NestJS, Java/Spring Boot, Python/Django, Docker, AWS, Ruby on Rails, GraphQL",
      icon: "icons/cloud.png",
    },
    {
      name: "Database Management",
      subtitle: "PostgreSQL, MongoDB, Prisma, Data Modeling, Redis",
      icon: "icons/database.png",
    },
    {
      name: "AI Engineering",
      subtitle:
        "LLM Integration & Prompt Engineering, RAG, Agentic AI, Generative AI",
      icon: "icons/ai.png",
    },
    {
      name: "Testing & Quality",
      subtitle: "Cypress, Jest, Testing Library, Accessibility, TDD",
      icon: "icons/testing.png",
    },
    {
      name: "UI/UX Engineering",
      subtitle: "Tailwind, Three.js, Framer Motion, Figma",
      icon: "icons/design.png",
    },
  ],
  projects: [
    {
      name: "Vila Emes",
      description:
        "Astro-powered hotel website for a local family business, optimized for speed, SEO, and multilingual discovery.",
      image: "projects/project13.webp",
      link: "https://vilaemes.com/",
    },
    {
      name: "Student Card Albania",
      description:
        "ISIC platform for Albanian students to buy digital or physical cards and access local and global benefits.",
      image: "projects/project14.webp",
      link: "https://studentcard.al/",
    },
    {
      name: "Bioloupe",
      description:
        "Biopharma intelligence platform with structured data pipelines, agentic workflows, and Monte Carlo forecasting tools.",
      image: "projects/project11.webp",
      link: "https://bioloupe.com/",
    },
    {
      name: "The Coaching Masters",
      description:
        "Video learning, social community, marketplace, and AI coaching platform serving 16K+ users.",
      image: "projects/project12.webp",
      link: "https://thecoachingmasters.com/",
    },
  ],
  contact: {
    name: "Erban Danaj",
    address: "Software Engineer",
    socials: {
      linkedin: "https://www.linkedin.com/in/erban-danaj/",
      github: "https://github.com/danajerban",
    },
    mail: "danajerban@gmail.com",
  },
};
