#!/usr/bin/env python3
"""First installation only. Run through authorized ECS sudo; prints no credentials."""
import grp, json, os, pathlib, pwd, secrets, subprocess
assert os.geteuid() == 0, 'sudo required'
def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)
def sql(text):
    return run(['mariadb', '--batch', '--skip-column-names'], input=text, text=True, capture_output=True).stdout
root=pathlib.Path('/srv/meeting-admin')
assert int(run(['node','--version'],capture_output=True,text=True).stdout.strip().split('.')[0][1:]) >= 20, 'Node 20+ required'
assert not root.exists(), 'Existing project directory; stop and inspect'
assert int(sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='meeting_admin';")) == 0
assert int(sql("SELECT COUNT(*) FROM mysql.user WHERE User='meeting_admin';")) == 0
assert not pathlib.Path('/etc/meeting-admin.env').exists()
assert not pathlib.Path('/etc/systemd/system/meeting-admin.service').exists()
assert '/mosshqq/meeting-admin/' not in run(['nginx','-T'],capture_output=True,text=True).stdout
assert not any(':3109 ' in line or ':3110 ' in line for line in run(['ss','-lnt'],capture_output=True,text=True).stdout.splitlines())
nginx=pathlib.Path('/etc/nginx/conf.d/cloudbase-public-file-proxy.conf')
old=nginx.read_text()
anchor='include /etc/nginx/snippets/shop-demo.conf;'
assert old.count(anchor)==1, 'Nginx anchor changed; inspect before editing'
try: pwd.getpwnam('meeting-admin'); raise RuntimeError('Application user already exists')
except KeyError: pass
run(['useradd','--system','--home-dir','/srv/meeting-admin/persistent','--shell','/usr/sbin/nologin','meeting-admin'])
uid=pwd.getpwnam('meeting-admin').pw_uid; gid=grp.getgrnam('meeting-admin').gr_gid; deploy_uid=pwd.getpwnam('deploy').pw_uid
for directory in [root,root/'releases']:
    directory.mkdir();os.chown(directory,deploy_uid,gid);directory.chmod(0o755)
for directory in [root/'persistent',root/'persistent/uploads']:
    directory.mkdir();os.chown(directory,uid,gid);directory.chmod(0o750)
db_password=secrets.token_hex(24); admin_password=secrets.token_urlsafe(24)
sql("CREATE DATABASE meeting_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"+''.join(f"CREATE USER 'meeting_admin'@'{host}' IDENTIFIED BY '{db_password}'; GRANT ALL PRIVILEGES ON meeting_admin.* TO 'meeting_admin'@'{host}';" for host in ['localhost','127.0.0.1']))
env=pathlib.Path('/etc/meeting-admin.env')
env.write_text(f'NODE_ENV=production\nHOST=127.0.0.1\nPORT=3109\nMYSQL_DATABASE_URL=mysql://meeting_admin:{db_password}@127.0.0.1:3306/meeting_admin?connection_limit=3\nSTORAGE_DIR=/srv/meeting-admin/persistent/uploads\nPUBLIC_BASE_PATH=/mosshqq/meeting-admin/\nSESSION_COOKIE_NAME=meeting_admin_session\nCOOKIE_SECURE=true\nSEED_PASSWORD={admin_password}\nSESSION_HOURS=8\n')
os.chown(env,0,gid);env.chmod(0o640)
password_file=pathlib.Path('/etc/meeting-admin.initial-admin-password');password_file.write_text(admin_password+'\n');password_file.chmod(0o600)
unit='''[Unit]
Description=Meeting administration MVP
After=network.target mariadb.service
[Service]
Type=simple
User=meeting-admin
Group=meeting-admin
WorkingDirectory=/srv/meeting-admin/current
EnvironmentFile=/etc/meeting-admin.env
ExecStart=/usr/bin/node /srv/meeting-admin/current/build-server/index.js
Restart=on-failure
RestartSec=3
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/srv/meeting-admin/persistent
MemoryHigh=192M
MemoryMax=256M
Nice=10
[Install]
WantedBy=multi-user.target
'''
pathlib.Path('/etc/systemd/system/meeting-admin.service').write_text(unit)
release_source=pathlib.Path(__file__).with_name('release.sh')
assert release_source.exists(), 'release.sh must be beside bootstrap.py'
release_target=pathlib.Path('/usr/local/sbin/meeting-admin-release')
release_target.write_bytes(release_source.read_bytes());release_target.chmod(0o755)
sudoers=pathlib.Path('/etc/sudoers.d/meeting-admin-deploy')
sudoers.write_text('deploy ALL=(root) NOPASSWD: /usr/local/sbin/meeting-admin-release *\n');sudoers.chmod(0o440)
run(['visudo','-cf',str(sudoers)],capture_output=True)
snippet=pathlib.Path('/etc/nginx/snippets/meeting-admin.locations.conf')
snippet.write_text('''location = /mosshqq/meeting-admin { return 301 /mosshqq/meeting-admin/; }
location ^~ /mosshqq/meeting-admin/ {
    client_max_body_size 51m;
    proxy_pass http://127.0.0.1:3109/;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
''')
nginx.write_text(old.replace(anchor,anchor+'\n    include /etc/nginx/snippets/meeting-admin.locations.conf;'))
try: run(['nginx','-t'],capture_output=True)
except Exception:
    nginx.write_text(old);raise
run(['systemctl','daemon-reload']);run(['systemctl','enable','meeting-admin.service'],capture_output=True);run(['systemctl','reload','nginx'])
print(json.dumps({'prepared':True,'database':'meeting_admin','service':'meeting-admin','publicPath':'/mosshqq/meeting-admin/','scheduledBackups':False}))
