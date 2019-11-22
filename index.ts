import { readdirSync, PathLike, writeFileSync, readFileSync } from 'fs';
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
    onRateLimit: (retryAfter: any, options: { method: any; url: any; request: { retryCount: number; }; }) => {
      console.warn(`Request quota exhausted for request ${options.method} ${options.url}`)

      if (options.request.retryCount === 0) { // only retries once
        console.log(`Retrying after ${retryAfter} seconds!`)
        return true
      }
    },
    onAbuseLimit: (_: any, options: { method: any; url: any; }) => {
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
    userNames.push(new Promise<any>((resolve) => {
      simpleGit.log({ file: '.' },
        (err: any, log: any) => {
          if (!err) {
            resolve({
              name: dir,
              contributors: Array.from(new Set(log.all.map((logLine: any) => logLine.author_name)))
            });
          } else {
            resolve({});
          }
        });
    }));
  });

  const extension = await Promise.all(userNames)
  const users = Array.from(new Set([].concat(...extension.map((c: { name: string, contributors: string[] }) => c.contributors))));

  const userTable: any[] = [];
  for (const user of users) {
    const result = await octokit.search.users({
      q: user
    });

    if (result.data.items[0]) {
      const response = await octokit.users.getByUsername({
        username: result.data.items[0].login
      });
      const page = response.data;
      const isRedhat = page.company !== null && page.company.indexOf('Hat') != -1;
      if (page.name !== user) console.log('!!', page.name, user, 'is this the same user?');
      userTable.push({
        username: user,
        lookupName: page.name,
        email: page.email,
        isRedhat: isRedhat
      })
    } else {
      console.log('user not found', user);
    }
  }

  writeFileSync('./contributors.json', JSON.stringify(userTable));
  // const userTable = JSON.parse(readFileSync('./contributors.json', 'utf8'))
  extension.forEach((ext: any) => {
    const users = ext.contributors;
    users.forEach((user: string) => {
      const lookupUser = userTable.find((u:any) => u.username === user);
      if (lookupUser) {
        console.log(ext.name, lookupUser.lookupName || user, lookupUser.email, (lookupUser.isRedhat ? 'Red Hat' : 'external'));
      } else {
        console.log('user not found', user);
      }
    });
  });
})();