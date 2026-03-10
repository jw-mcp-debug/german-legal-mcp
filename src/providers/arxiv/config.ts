export const arxivConfig = {
  apiUrl: 'https://export.arxiv.org/api/query',
  htmlUrl: 'https://arxiv.org/html',
  enabled: process.env.GLMCP_ARXIV_ENABLED !== 'false',
};
