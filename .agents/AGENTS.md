# Workspace Rules

## Deployment Rule
After every code edit or task completion:
1. Stage and commit changes to Git (`git add .`, `git commit -m "..."`).
2. Push to remote (`git push`).
3. Deploy to production using Vercel CLI (`npx vercel --prod`).
