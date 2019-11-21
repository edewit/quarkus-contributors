import { readdirSync, PathLike } from 'fs';
import fetch from 'node-fetch';
const Octokit = require('@octokit/rest')
  .plugin(require('@octokit/plugin-throttling'))

const getDirectories = (source: PathLike) =>
  readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

const octokit = new Octokit({
  auth: process.env.TOKEN,
  userAgent: 'quarkus contributers search',
  throttle: {
    onRateLimit: (retryAfter, options) => {
      console.warn(`Request quota exhausted for request ${options.method} ${options.url}`)

      if (options.request.retryCount === 0) { // only retries once
        console.log(`Retrying after ${retryAfter} seconds!`)
        return true
      }
    },
    onAbuseLimit: (retryAfter, options) => {
      // does not retry, only logs a warning
      console.warn(`Abuse detected for request ${options.method} ${options.url}`)
    }
  }
});

(async () => {
  const base = './extensions';
  const userNames: any = [];
  getDirectories(base).forEach(dir => {
    const simpleGit = require('simple-git')(base + '/' + dir);
    userNames.push(new Promise<string[]>((resolve) => {
      simpleGit.log({ file: '.' },
        (err: any, log: any) => {
          if (!err) {
            resolve(log.all.map((logLine: any) => logLine.author_name));
          } else {
            resolve([]);
          }
        });
    }));
  });

  const unique = new Set([].concat(...(await Promise.all(userNames))));
  const users = Array.from(unique.values());

  users.forEach(async (user) => {
    const result = await octokit.search.users({
      q: user
    });

    if (result.data.items[0]) {
      const response = await fetch(result.data.items[0].html_url);
      if (response.ok) {
        const isRedhat = (await response.text()).indexOf('Red Hat') != -1;
        console.log(user + ' -> ' + (isRedhat ? 'from Red Hat' : 'external'));
      } else {
        console.error("HTTP-Error: " + response.status);
      }
    } else {
      console.log('user not found', user);
    }
  });
})();