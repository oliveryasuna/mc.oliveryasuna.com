import {defineConfig} from 'vitepress';

const GTM_ID = 'GTM-T9NRDPPK';

export default defineConfig({
  lang: 'en-US',
  title: 'Oliver Yasuna',
  description: 'Documentation for Oliver Yasuna\'s Minecraft mods and tools.',

  cleanUrls: true,

  // markdown: {lineNumbers: true},

  themeConfig: {
    logo: '/me.jpg',

    search: {provider: 'local'},

    nav: [
      {
        text: 'Home',
        link: '/'
      },
      {
        text: 'Modkit',
        link: '/modkit/'
      }
      // {
      //   text: 'COAL',
      //   link: '/coal/'
      // }
    ],

    sidebar: {
      '/modkit/': [
        {
          text: 'Modkit',
          items: [
            {
              text: 'Overview',
              link: '/modkit/'
            },
            {
              text: 'Introduction',
              link: '/modkit/introduction'
            },
            {
              text: 'Getting started',
              link: '/modkit/getting-started'
            }
          ]
        },
        {
          text: 'Concepts',
          collapsed: false,
          items: [
            {
              text: 'The Modkit model',
              link: '/modkit/concepts/the-model'
            },
            {
              text: 'The plugin suite',
              link: '/modkit/concepts/the-plugin-suite'
            },
            {
              text: 'Multi-version builds',
              link: '/modkit/concepts/multi-version'
            }
          ]
        },
        {
          text: 'Guides',
          collapsed: false,
          items: [
            {
              text: 'Mod metadata',
              link: '/modkit/guides/mod-metadata'
            },
            {
              text: 'Mixins',
              link: '/modkit/guides/mixins'
            },
            {
              text: 'Dependencies',
              link: '/modkit/guides/dependencies'
            },
            {
              text: 'Run configurations',
              link: '/modkit/guides/runs'
            },
            {
              text: 'Data generation',
              link: '/modkit/guides/datagen'
            },
            {
              text: 'Publishing',
              link: '/modkit/guides/publishing'
            },
            {
              text: 'Continuous integration',
              link: '/modkit/guides/ci'
            },
            {
              text: 'Testing',
              link: '/modkit/guides/testing'
            },
            {
              text: 'Multi-version',
              link: '/modkit/guides/multi-version'
            }
          ]
        },
        {
          text: 'Reference',
          collapsed: false,
          items: [
            {
              text: 'modkit { } (core)',
              link: '/modkit/reference/core'
            },
            {
              text: 'Loaders',
              link: '/modkit/reference/loaders'
            },
            {
              text: 'Metadata',
              link: '/modkit/reference/metadata'
            },
            {
              text: 'Mixins',
              link: '/modkit/reference/mixins'
            },
            {
              text: 'Dependencies',
              link: '/modkit/reference/dependencies'
            },
            {
              text: 'Run',
              link: '/modkit/reference/run'
            },
            {
              text: 'Datagen',
              link: '/modkit/reference/datagen'
            },
            {
              text: 'Publish',
              link: '/modkit/reference/publish'
            },
            {
              text: 'CI',
              link: '/modkit/reference/ci'
            },
            {
              text: 'Testing',
              link: '/modkit/reference/testing'
            },
            {
              text: 'Multiversion',
              link: '/modkit/reference/multiversion'
            },
            {
              text: 'Scaffold',
              link: '/modkit/reference/scaffold'
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
        icon: 'discord',
        link: 'https://discord.gg/WzcXYYbcr7'
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
  },

  head: [
    [
      'script',
      {id: 'gtm'},
      `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`
    ]
  ],

  transformHtml: ((code: string): string =>
    code.replace(
      /<body([^>]*)>/,
      `<body$1>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
    )),

  outDir: '../dist'
});
