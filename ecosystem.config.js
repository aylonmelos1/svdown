module.exports = {
    apps: [
        {
            name: 'SVDown',
            cwd: '/root/svdown',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
                PIPED_INSTANCES: [
                    'https://piped.video',
                    'https://piped.mha.fi',
                    'https://piped.lunar.icu',
                    'https://piped.projectsegfau.lt',
                    'https://piped.mint.lgbt',
                    'https://piped.syncpundit.com',
                    'https://piped.smnz.de',
                    'https://piped.in.projectsegfau.lt',
                ].join(','),
                INVIDIOUS_INSTANCES: [
                    'https://yt.artemislena.eu',
                    'https://iv.ggtyler.dev',
                    'https://inv.nadeko.net',
                    'https://iv.nboeck.de',
                    'https://yewtu.be',
                    'https://inv.tux.pizza',
                    'https://invidious.private.coffee',
                    'https://invidious.lunar.icu',
                ].join(','),
            },
        },
    ],
};
