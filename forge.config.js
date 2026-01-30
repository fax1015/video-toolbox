const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
    packagerConfig: {
        name: 'Video Toolbox',
        executableName: 'VideoToolbox',
        icon: path.join(__dirname, 'assets', 'icons', 'favicon'), // Extension omitted intentionally
        asar: true,
        extraResource: [
            path.join(__dirname, 'bin')
        ],
        ignore: [
            /^\/dist$/,
            /^\/out$/,
            /^\/\.git$/,
            /^\/\.gitignore$/,
            /^\/\.vscode$/
        ]
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'VideoToolbox',
                setupIcon: path.join(__dirname, 'assets', 'icons', 'favicon.ico'),
                iconUrl: 'https://raw.githubusercontent.com/fax1015/media-converter/main/assets/icons/favicon.ico'
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['win32'],
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};