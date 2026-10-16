import { app, type HttpHandler } from '@azure/functions';
import { handleGenerationConnector } from '../handlers/generateOntology';

const generationConnector: HttpHandler = (request, context) =>
  handleGenerationConnector(request, context);

app.http('generationConnector', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'generation-connector',
  handler: generationConnector,
});
