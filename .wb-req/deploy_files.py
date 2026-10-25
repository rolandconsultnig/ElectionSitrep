"""Deploy the APK + OTA bundle to the production server via SFTP."""
import os
import sys
import time
import paramiko

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = "66.45.231.142"
USER = "root"
PASSWORD = "Samolan123@123@"

REPO = r"E:\projects\ElectionSitrep"
FILES = [
    # (local path, remote path)
    (os.path.join(REPO, "downloads", "npf-sitrep-field-release.apk"),
     "/var/www/electionsitrep/downloads/npf-sitrep-field-release.apk"),
]


def sftp_mkdirs(sftp, remote_dir):
    parts = [p for p in remote_dir.split("/") if p]
    cur = ""
    for p in parts:
        cur += "/" + p
        try:
            sftp.stat(cur)
        except IOError:
            sftp.mkdir(cur)


def upload_tree(sftp, local_dir, remote_dir):
    sftp_mkdirs(sftp, remote_dir)
    for root, _dirs, files in os.walk(local_dir):
        rel = os.path.relpath(root, local_dir).replace("\\", "/")
        rdir = remote_dir if rel == "." else remote_dir + "/" + rel
        sftp_mkdirs(sftp, rdir)
        for f in files:
            lp = os.path.join(root, f)
            rp = rdir + "/" + f
            sftp.put(lp, rp)


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=45,
                   banner_timeout=45, auth_timeout=45,
                   look_for_keys=False, allow_agent=False)
    sftp = client.open_sftp()

    # 1. APK
    for lp, rp in FILES:
        size = os.path.getsize(lp)
        print(f"Uploading {lp} -> {rp} ({size/1024/1024:.1f} MB)...", flush=True)
        t0 = time.time()
        sftp.put(lp, rp, callback=lambda sent, total: print(
            f"  {sent*100//total}%", end="\r", flush=True))
        print(f"\n  done in {time.time()-t0:.0f}s")

    # 2. OTA bundle tree: local ota/1.1.0/<updateId> -> remote ota/1.1.0/<updateId>
    ota_local = os.path.join(REPO, "ota", "1.1.0")
    for update_id in os.listdir(ota_local):
        src = os.path.join(ota_local, update_id)
        if not os.path.isdir(src):
            continue
        dst = f"/var/www/electionsitrep/ota/1.1.0/{update_id}"
        print(f"Uploading OTA {update_id} -> {dst}", flush=True)
        upload_tree(sftp, src, dst)
        print("  done")

    sftp.close()
    client.close()
    print("ALL UPLOADS COMPLETE")


if __name__ == "__main__":
    main()
