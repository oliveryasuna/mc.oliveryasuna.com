---
title: Home

layout: home

hero:
  name: Minecraft
  tagline: Documentation for my Minecraft mods and tools.
  image: https://minecraft.wiki/images/Minecraft_social_icon.png
  actions:
    # - theme: sponsor
    - theme: brand
      text: ♥ Sponsor
      link: https://github.com/sponsors/oliveryasuna
      target: _blank
      rel: noopener

features:
  - title: Modkit
    icon:
      # src: /modkit.svg
      light: /modkit-logo-light.svg
      dark: /modkit-logo-dark.svg
      width: 48
      height: 48
    details: One Gradle DSL for building multi-loader mods from a single codebase. Wraps Loom, ModDevGradle, and Stonecutter so you configure everything once.
    link: /modkit/
    linkText: Docs

  - title: COAL
    icon:
      src: /coal.svg
      width: 48
      height: 48
      class: coal-logo
    details: SLF4J-style abstraction layer for Minecraft mod configuration. Consumer mods depend on coal-api; pluggable providers implement the SPI.
        Working on docs rewrite; please check back soon.
    # link: /coal/
    # linkText: Docs
---
