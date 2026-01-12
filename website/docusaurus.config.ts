import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'KubePolaris',
  tagline: '企业级 Kubernetes 多集群管理平台',
  favicon: 'img/favicon.ico',

  // 生产环境 URL，用于生成 sitemap 和规范 URL
  // 可更改为你的自定义域名
  url: 'https://kubepolaris.io',
  // GitHub Pages 部署路径，如果是自定义域名可以设为 '/'
  baseUrl: '/',

  // GitHub Pages 部署配置
  organizationName: 'kubepolaris', // GitHub 组织/用户名
  projectName: 'kubepolaris', // 仓库名

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans', 'en'],
    localeConfigs: {
      'zh-Hans': {
        label: '简体中文',
        htmlLang: 'zh-CN',
      },
      en: {
        label: 'English',
        htmlLang: 'en-US',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/clay-wangzhi/KubePolaris/tree/main/website/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        // TODO: 待博客内容准备好后启用
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // 社交卡片图片
    image: 'img/kubepolaris-social-card.png',
    
    // 公告栏
    announcementBar: {
      id: 'support_us',
      content: '⭐️ 如果你觉得 KubePolaris 有帮助，请在 <a target="_blank" rel="noopener noreferrer" href="https://github.com/clay-wangzhi/KubePolaris">GitHub</a> 上给我们一个 Star！',
      backgroundColor: '#1890ff',
      textColor: '#ffffff',
      isCloseable: true,
    },

    navbar: {
      title: 'KubePolaris',
      logo: {
        alt: 'KubePolaris Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: '文档',
        },
        // TODO: 待博客内容准备好后启用
        // {
        //   to: '/blog',
        //   label: '博客',
        //   position: 'left',
        // },
        // TODO: 待案例展示页面创建后启用
        // {
        //   to: '/showcase',
        //   label: '案例展示',
        //   position: 'left',
        // },
        // 版本下拉
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        // 语言切换
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/clay-wangzhi/KubePolaris',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            {
              label: '快速开始',
              to: '/docs/getting-started/quick-start',
            },
            {
              label: '安装指南',
              to: '/docs/getting-started/installation',
            },
            {
              label: '用户指南',
              to: '/docs/user-guide/cluster-management',
            },
          ],
        },
        {
          title: '社区',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/clay-wangzhi/KubePolaris/discussions',
            },
            {
              label: 'Slack',
              href: 'https://kubepolaris.slack.com',
            },
          ],
        },
        {
          title: '更多',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/clay-wangzhi/KubePolaris',
            },
            {
              label: '发布日志',
              href: 'https://github.com/clay-wangzhi/KubePolaris/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} KubePolaris. Built with Docusaurus.`,
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'go', 'typescript'],
    },

    // Algolia 搜索配置（需要申请）
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'kubepolaris',
    //   contextualSearch: true,
    // },

    // 本地搜索配置
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },

    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,

  plugins: [
    // 本地搜索插件
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en', 'zh'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],
};

export default config;

