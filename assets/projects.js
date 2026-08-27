(() => {
  "use strict";

  // Add project objects here. Every project needs a URL for its details link.
  const projects = [
    {
      name: "pp",
      description: "pp treats the dependency graph as the semantics of a build and deployment language. Values are content-addressed, and traces record the external reads that determine whether a cached computation is still valid. Capability-scoped effects control access to files, secrets, and deployment targets; the same graph can run locally, in parallel, or across signed-token nodes.",
      blurb: "A content-addressed language for builds and deployments.",
      stack: ["Common Lisp"],
      url: "https://github.com/pranavra0/pp",
    },
    {
      name: "Heroes of Sokoban",
      description: "A Common Lisp Sokoban campaign built around switching between heroes with different abilities. Its levels introduce mechanics including doors, switches, pulling, and blinking, with undo and restart controls for testing solutions.",
      blurb: "Sokoban campaign with switchable heroes and distinct abilities.",
      stack: ["Common Lisp"],
      url: "https://github.com/pranavra0/sokoban",
    },
    {
      name: "First Person Platformer",
      description: "A 3D first-person platformer built around chasing a faster completion time. Its movement system includes sprinting, wall-running, and grappling, with separate scenes for levels, transitions, menus, and player control.",
      blurb: "A 3D first-person platformer built for time trials.",
      stack: ["Godot 4.1", "GDScript", "3D"],
      url: "https://github.com/pranavra0/FirstPersonPlatformer",
    },
    {
      name: "2024 Election Model",
      description: "An R model that scrapes RealClearPolitics polling tables and turns state-level spreads into Electoral College simulations. It combines recent polling with 2020 data, uses a Johnson distribution for the simulated spreads, and runs 1,500 trials to estimate state and candidate win probabilities.",
      blurb: "RCP polling data modeled as 1,500 Electoral College simulations.",
      stack: ["R", "rvest", "RSelenium", "SuppDists"],
      url: "https://github.com/pranavra0/2024ElectionModel",
    },
    {
      name: "The Orchestrator",
      description: "A Docker job scheduler with a FastAPI control plane, worker nodes, and a React dashboard. The scheduler supports first-fit, round-robin, and resource-aware placement; the API also tracks containers, nodes, jobs, and settings in MongoDB.",
      blurb: "FastAPI job scheduling across Docker worker nodes.",
      stack: ["Python", "FastAPI", "Docker", "MongoDB", "React", "Vite"],
      url: "https://github.com/pranavra0/4155Capstone",
    },
    {
      name: "Forum Experiment",
      blurb: "Server-rendered Go forum with threads, replies, and minimal JavaScript.",
      description: "A Go forum rendered with HTML templates and backed by SQLite. It covers accounts, sections, threads, quoted replies, search, pagination, and moderation while keeping client-side JavaScript close to zero.",
      stack: ["Go", "Chi", "SQLite", "HTML templates"],
      url: "https://github.com/pranavra0/forum-experiment",
    },
    {
      name: "Compiler",
      description: "Compy is an experimental systems language and compiler implemented in Rust. It lowers explicit programs to LLVM IR for native builds, or interprets them directly, with fixed-width integers, aggregates, raw pointers, modules, compile-time evaluation, and a C ABI.",
      blurb: "An explicit systems language with an LLVM backend and interpreter.",
      stack: ["Rust", "LLVM", "Compy"],
      url: "https://github.com/pranavra0/compiler",
    },

  ];

  const section = document.querySelector(".projects");
  const grid = document.querySelector(".project-grid");
  const dialog = document.querySelector(".project-dialog");
  const dialogTitle = document.querySelector("#project-dialog-title");
  const dialogDescription = document.querySelector(".project-dialog-description");
  const dialogStack = document.querySelector(".project-dialog-stack");
  const dialogLink = document.querySelector(".project-dialog-link");
  const dialogClose = document.querySelector(".project-dialog-close");
  if (!section || !grid || !dialog || projects.length === 0) return;

  const createProjectCard = (project, index) => {
    if (!project.url) {
      throw new Error(`Project "${project.name}" needs a URL`);
    }

    const card = document.createElement("button");
    card.className = "project-card";
    card.type = "button";
    card.dataset.projectIndex = index;
    card.setAttribute("aria-haspopup", "dialog");


    const content = document.createElement("div");
    content.className = "project-content";

    const heading = document.createElement("h3");
    heading.textContent = project.name;
    content.append(heading);
    if (project.blurb) {
      const blurb = document.createElement("p");
      blurb.className = "project-blurb";
      blurb.textContent = project.blurb;
      content.append(blurb);
    }



    if (project.stack?.length) {
      const stack = document.createElement("p");
      stack.className = "project-stack";
      stack.textContent = project.stack.join(", ");
      content.append(stack);
    }

    card.append(content);
    return card;
  };


  projects.forEach((project, index) => {
    const card = createProjectCard(project, index);
    grid.append(card);
  });
  section.hidden = false;

  const openProject = (index) => {
    const project = projects[index];
    dialogTitle.textContent = project.name;
    dialogDescription.textContent = project.description || project.blurb || "";
    dialogDescription.hidden = !project.description && !project.blurb;
    dialogStack.textContent = project.stack?.join(", ") || "";
    dialogStack.hidden = !project.stack?.length;
    dialogLink.href = project.url;
    dialogLink.textContent = `Open ${project.name} →`;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  };
  const closeProject = () => {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  };

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".project-card");
    if (!card) return;
    openProject(Number(card.dataset.projectIndex));
  });

  dialogClose.addEventListener("click", closeProject);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeProject();
  });

})();
