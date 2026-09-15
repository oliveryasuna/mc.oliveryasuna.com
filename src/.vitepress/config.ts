import {defineConfig} from 'vitepress';

export default defineConfig({
  title: 'Oliver Yasuna',
  description: 'Documentation for Oliver Yasuna\'s Minecraft mods, libraries, and tools.',
  cleanUrls: true,

  themeConfig: {
    nav: [
      {
        text: 'Home',
        link: '/'
      },
      {
        text: 'Modkit',
        link: '/modkit/'
      },
      {
        text: 'COAL',
        link: '/coal/'
      }
    ],

    sidebar: {
      '/modkit/': [
        {
          text: 'Modkit',
          items: [
            {
              text: 'Overview',
              link: '/modkit/'
            }
          ]
        }
      ]
    },

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/oliveryasuna'
      },
      {
        icon: 'modrinth',
        link: 'https://modrinth.com/user/oliveryasuna'
      },
      {
        icon: 'curseforge',
        link: 'https://www.curseforge.com/members/oliveryasuna/projects'
      }
    ],

    footer: {
      message: 'NOT AN OFFICIAL MINECRAFT WEBSITE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
      copyright: `Copyright © ${(new Date()).getFullYear()} Oliver Yasuna`
    }
  }
});
