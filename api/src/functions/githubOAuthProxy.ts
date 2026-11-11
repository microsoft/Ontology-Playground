import { app, type HttpHandler } from '@azure/functions';
import { handleGitHubOAuthProxy } from '../handlers/githubOAuthProxy';

const githubOAuthProxy: HttpHandler = (request, context) =>
  handleGitHubOAuthProxy(request, context);

app.http('githubOAuthProxy', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'github-oauth/{*path}',
  handler: githubOAuthProxy,
});
