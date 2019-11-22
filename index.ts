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
            let contributors = log.all.map((logLine: any) => { return {name: logLine.author_name, email: logLine.author_email}});
            const contributorsNames = contributors.map((c: { name: any; }) => c.name);
            contributors = contributors.filter((c: { name: any; }, i: number) => contributorsNames.indexOf(c.name) >= i);
            resolve({
              name: dir,
              contributors
            });
          } else {
            resolve({});
          }
        });
    }));
  });

  const extension = await Promise.all(userNames);
  const usersObj = [].concat(...extension.map((ext:any) => ext.contributors));
  const contributorsNames = usersObj.map((c: { name: any; }) => c.name);
  const users = usersObj.filter((u: any, i: number) => contributorsNames.indexOf(u.name) >= i);

  const userTable: any[] = [];
  for (const user of users) {
    const result = await octokit.search.users({
      q: user.name
    });

    if (result.data.items[0]) {
      await findIfRedHat(result, user, userTable);
    } else {
      const fallbackResult = await octokit.search.users({q: user.email});
      if (fallbackResult.data.items[0]) {
        await findIfRedHat(fallbackResult, user, userTable)
      }
    }
  }

  writeFileSync('./contributors.json', JSON.stringify(userTable));
  // const userTable = JSON.parse(readFileSync('./contributors.json', 'utf8'))
  extension.forEach((ext: any) => {
    const users = ext.contributors;
    users.forEach((user: any) => {
      const lookupUser = userTable.find((u:any) => u.username === user.name);
      if (lookupUser) {
        console.log(ext.name, ',', lookupUser.lookupName || user.name, ',', lookupUser.email || user.email, ',', (lookupUser.isRedhat ? 'Red Hat' : 'external'));
      } else {
        console.log(ext.name, ',', user.name, ',', user.email, ',', 'unknown');
      }
    });
  });
})();

async function findIfRedHat(result: any, user: any, userTable: any[]) {
  const response = await octokit.users.getByUsername({
    username: result.data.items[0].login
  });
  const page = response.data;
  const isRedhat = page.company !== null && page.company.indexOf('Hat') != -1;
  if (page.name !== user.name)
    console.warn('!!', page.name, user.name, 'is this the same user?');
  userTable.push({
    username: user.name,
    lookupName: page.name,
    email: page.email,
    isRedhat: isRedhat
  });
}
