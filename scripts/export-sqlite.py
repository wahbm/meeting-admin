#!/usr/bin/env python3
"""Consistent, private business-data export. Never export accounts or sessions."""
import argparse, hashlib, json, os, pathlib, sqlite3, tempfile
parser=argparse.ArgumentParser();parser.add_argument('--source',default='prisma/meeting.db');parser.add_argument('--output',required=True);args=parser.parse_args()
source=sqlite3.connect('file:'+str(pathlib.Path(args.source).resolve())+'?mode=ro',uri=True)
fd,snapshot=tempfile.mkstemp(prefix='meeting-admin-snapshot-',suffix='.db');os.close(fd)
try:
    target=sqlite3.connect(snapshot);source.backup(target);source.close();target.row_factory=sqlite3.Row
    assert target.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    tables={name:[dict(row) for row in target.execute('SELECT * FROM "'+name+'"')] for name in ['Reference','Series','Meeting','Person','Upload','Document','Task','Material','Delivery','Attendance','ImportFailure','Audit']}
    payload={'format':'meeting-admin-sqlite-v1','sourceSha256':hashlib.sha256(pathlib.Path(snapshot).read_bytes()).hexdigest(),'tables':tables}
    out=pathlib.Path(args.output);out.write_text(json.dumps(payload,ensure_ascii=False));out.chmod(0o600)
    print(json.dumps({'exported':True,'counts':{k:len(v) for k,v in tables.items()},'accountsAndSessionsExcluded':True}))
    target.close()
finally: os.unlink(snapshot)
