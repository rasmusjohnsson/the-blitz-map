@echo off
echo Deploying The Blitz Map to Netlify...
git add index.html
git commit -m "Update: new session data"
git push origin master
npx netlify-cli deploy --prod --dir=.
echo.
echo Deploy complete! Visit: https://the-blitz-map.netlify.app
pause
