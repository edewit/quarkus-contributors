import { readdirSync, PathLike } from 'fs';
import Octokit from "@octokit/rest";
import fetch from 'node-fetch';

const getDirectories = (source: PathLike) =>
  readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

const octokit = new Octokit({
  auth: '<token>',
  userAgent: 'quarkus contributers search'
});

(async () => {
  const base = './extensions';
  const userNames: any = [];
  getDirectories(base).forEach(dir => {
    const simpleGit = require('simple-git')(base + '/' + dir);
    userNames.push(new Promise<string>((resolve) => {
      simpleGit.log({ '--reverse': null, file: 'pom.xml' },
        (err: any, log: any) => {
          if (!err) {
            resolve(log.latest.author_name);
          } else {
            resolve('');
          }
        });
    }));
  });

  const unique = new Set(await Promise.all(userNames));
  const users = Array.from(unique.values());

  users.forEach(async (user) => {
    const result = await octokit.search.users({
      q: 'fullname:' + user
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