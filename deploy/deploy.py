#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
石器游戏厅部署脚本
------------------------------------------------------------
安全边界：
- 只写入 /opt/game-tools、/etc/systemd/system/game-tools.service、
  /etc/nginx/conf.d/game-tools.conf
- 不修改 80 / 8090 上已有的任何站点配置
- 新服务只监听 127.0.0.1:8930，由独立的 nginx 3011 端口对外提供
- 远端 backups/ 目录仅保留最近 20 份历史备份，超出自动清理，防止磁盘占满

用法：
    python deploy/deploy.py
"""
import os
import posixpath
import sys
import time

import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_FILE = os.path.join(ROOT, "ssh.env")
REMOTE_DIR = "/opt/game-tools"
SERVICE_PATH = "/etc/systemd/system/game-tools.service"
NGINX_CONF = "/etc/nginx/conf.d/game-tools.conf"
PUBLIC_PORT = 8092
BACKUP_KEEP = 20                        # 远端历史备份保留份数（超出自动清理）
STAMP = time.strftime("%Y%m%d_%H%M%S")


def load_env(path):
    env = {}
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    return env


def run(client, cmd, check=True):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code != 0:
        raise RuntimeError("远程命令失败(%s): %s\n%s\n%s" % (code, cmd, out, err))
    return out, err, code


def mkdir_p(sftp, remote):
    parts = remote.strip("/").split("/")
    cur = ""
    for part in parts:
        cur += "/" + part
        try:
            sftp.stat(cur)
        except IOError:
            sftp.mkdir(cur)


def upload_file(sftp, local, remote, mode=None):
    mkdir_p(sftp, posixpath.dirname(remote))
    sftp.put(local, remote)
    if mode is not None:
        sftp.chmod(remote, mode)


def upload_tree(sftp, local_dir, remote_dir):
    for base, dirs, files in os.walk(local_dir):
        rel = os.path.relpath(base, local_dir)
        target = remote_dir if rel == "." else posixpath.join(remote_dir, rel.replace("\\", "/"))
        mkdir_p(sftp, target)
        for name in files:
            src = os.path.join(base, name)
            dst = posixpath.join(target, name)
            sftp.put(src, dst)
            sftp.chmod(dst, 0o644)


def main():
    env = load_env(ENV_FILE)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(env["SSH_HOST"], username=env["SSH_USER"], password=env["SSH_PASS"], timeout=25)
    sftp = client.open_sftp()
    try:
        print("[1/7] 检查运行环境")
        out, _, _ = run(client, "python3 -V; nginx -v 2>&1; getenforce 2>/dev/null || true")
        print(out.strip())
        run(client, "id gametools >/dev/null 2>&1 || useradd -r -s /sbin/nologin gametools")
        run(client, "mkdir -p %s/site %s/server %s/data %s/backups %s/.deploy" % (
            REMOTE_DIR, REMOTE_DIR, REMOTE_DIR, REMOTE_DIR, REMOTE_DIR))

        print("[2/7] 上传静态站点到临时目录")
        run(client, "rm -rf %s/.deploy/site" % REMOTE_DIR)
        upload_tree(sftp, os.path.join(ROOT, "site"), "%s/.deploy/site" % REMOTE_DIR)

        print("[3/7] 上传后端")
        upload_file(sftp, os.path.join(ROOT, "server", "app.py"), "%s/.deploy/app.py" % REMOTE_DIR, 0o644)

        print("[4/7] 切换站点文件（保留旧版本备份）")
        run(client, "rm -rf %s/site.old; [ -d %s/site ] && mv %s/site %s/site.old || true" % (
            REMOTE_DIR, REMOTE_DIR, REMOTE_DIR, REMOTE_DIR))
        run(client, "mv %s/.deploy/site %s/site" % (REMOTE_DIR, REMOTE_DIR))
        run(client, "cp -a %s/server/app.py %s/backups/app.py.%s 2>/dev/null || true" % (
            REMOTE_DIR, REMOTE_DIR, STAMP))
        run(client, "mv %s/.deploy/app.py %s/server/app.py" % (REMOTE_DIR, REMOTE_DIR))
        run(client, "chown -R gametools:gametools %s" % REMOTE_DIR)
        run(client, "chmod 750 %s %s/data" % (REMOTE_DIR, REMOTE_DIR))

        print("[5/7] 安装 systemd 服务与 nginx 配置")
        upload_file(sftp, os.path.join(ROOT, "deploy", "game-tools.service"), "/tmp/game-tools.service", 0o644)
        upload_file(sftp, os.path.join(ROOT, "deploy", "nginx-game-tools.conf"), "/tmp/game-tools.conf", 0o644)
        run(client, "cp -a %s %s/backups/game-tools.service.%s 2>/dev/null || true" % (SERVICE_PATH, REMOTE_DIR, STAMP))
        run(client, "cp -a %s %s/backups/nginx-game-tools.conf.%s 2>/dev/null || true" % (NGINX_CONF, REMOTE_DIR, STAMP))
        run(client, "install -m 644 /tmp/game-tools.service %s" % SERVICE_PATH)
        run(client, "install -m 644 /tmp/game-tools.conf %s" % NGINX_CONF)
        # 清理历史备份：按修改时间保留最近 BACKUP_KEEP 份，其余删除（首次部署目录为空也安全）
        run(client, "cd %s/backups && ls -1t 2>/dev/null | tail -n +%d | xargs -r rm -f" % (
            REMOTE_DIR, BACKUP_KEEP + 1), check=False)

        print("[6/7] 启动后端并重载 nginx")
        run(client, "systemctl daemon-reload")
        run(client, "systemctl enable game-tools >/dev/null 2>&1 || true")
        run(client, "systemctl restart game-tools")
        time.sleep(2)
        run(client, "nginx -t")
        run(client, "systemctl reload nginx")
        time.sleep(1)
        out, err, _ = run(client, "systemctl is-active game-tools; systemctl is-active nginx; "
                                 "curl -s -o /dev/null -w 'local_games=%{http_code}\\n' "
                                 "http://127.0.0.1:" + str(PUBLIC_PORT) + "/games/; "
                                 "curl -s http://127.0.0.1:8930/games/healthz")
        print(out.strip())

        print("[7/7] 最近日志")
        out, _, _ = run(client, "journalctl -u game-tools -n 8 --no-pager 2>/dev/null || true")
        print(out.strip())
        print("部署完成：http://%s:%d/games/" % (env["SSH_HOST"], PUBLIC_PORT))
    finally:
        sftp.close()
        client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write("部署失败: %s\n" % exc)
        sys.exit(1)
