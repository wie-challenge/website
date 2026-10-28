from pathlib import Path
import subprocess,json,datetime
root=Path(__file__).resolve().parents[5]
out=Path(__file__).resolve().parent
commands=[('lint',['pnpm','lint'],root),('typecheck',['pnpm','typecheck'],root),('api-unit',['pnpm','--filter','@nasj/api','test'],root),('web-unit',['pnpm','--filter','@nasj/web','test'],root),('integration',['pnpm','test:integration'],root),('browser',['pnpm','test:e2e'],root),('showroom',['pnpm','test:e2e:demo'],root),('build',['pnpm','build'],root),('schema',['pnpm','exec','prisma','validate'],root/'apps/api'),('diff',['git','diff','--check'],root)]
records=[]
for name,args,cwd in commands:
 start=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with (out/(name+'.log')).open('w') as log:result=subprocess.run(args,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
 record={'name':name,'command':args,'cwd':str(cwd),'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'log':name+'.log'}
 records.append(record);(out/'commands.json').write_text(json.dumps(records,indent=2)+'\n');print(name,result.returncode,flush=True)
