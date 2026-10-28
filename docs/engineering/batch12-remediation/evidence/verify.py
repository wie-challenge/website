from pathlib import Path
import subprocess,json,datetime
root=Path(__file__).resolve().parents[4];out=Path(__file__).resolve().parent
commands=[('integration',['pnpm','test:integration'],root),('browser',['pnpm','test:e2e'],root),('api-unit',['pnpm','--filter','@nasj/api','test'],root),('web-unit',['pnpm','--filter','@nasj/web','test'],root),('lint',['pnpm','lint'],root),('typecheck',['pnpm','typecheck'],root),('build',['pnpm','build'],root),('schema',['pnpm','exec','prisma','validate'],root/'apps/api'),('diff',['git','diff','--check'],root)]
results=[]
for name,args,cwd in commands:
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(args,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
 results.append({'name':name,'command':args,'cwd':str(cwd),'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':r.returncode,'log':name+'.log'})
 (out/'commands.json').write_text(json.dumps(results,indent=2)+'\n');print(name,r.returncode,flush=True)
 if r.returncode:break
