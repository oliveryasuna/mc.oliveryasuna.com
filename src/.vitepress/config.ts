import {defineConfig} from 'vitepress';

const GTM_ID = 'GTM-T9NRDPPK';

export default defineConfig({
  lang: 'en-US',
  title: 'Oliver Yasuna',
  description: 'Documentation for Oliver Yasuna\'s Minecraft mods and tools.',

  cleanUrls: true,

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
