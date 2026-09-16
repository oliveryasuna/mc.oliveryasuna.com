import {defineRailway, github, project, service} from 'railway/iac';

export default defineRailway(() => {
  const web = service(
    'web',
    {
      source: github('oliveryasuna/mc.oliveryasuna.com', {checkSuites: false}),
      replicas: {'us-east4-eqdc4a': 1},
      domains: ['mc.oliveryasuna.com'],
      env: {RAILPACK_SPA_OUTPUT_DIR: 'dist'}
    }
  );

  return project(
    'mc.oliveryasuna.com',
    {resources: [web]}
  );
});
