module.exports = {
    apps: [
        {
            name: 'SVDown',
            cwd: '/root/svdown',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
                YT_DLP_BINARY: '/root/svdown/bin/yt-dlp',
                YT_DLP_COOKIES_PATH: '/root/svdown/data/youtube-cookies.txt',
            },
        },
    ],
};
