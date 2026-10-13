"""Minimal SSH helper for the ElectionSitrep production server (66.45.231.142)."""
import sys
import paramiko

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

HOST = "66.45.231.142"
USER = "root"
PASSWORD = "Samolan123@123@"


def run(cmd, timeout=120):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    for attempt in range(3):
        try:
            client.connect(
                HOST,
                username=USER,
                password=PASSWORD,
                timeout=45,
                banner_timeout=45,
                auth_timeout=45,
                look_for_keys=False,
                allow_agent=False,
            )
            break
        except Exception as e:
            if attempt == 2:
                raise
            import time
            time.sleep(2)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return code, out, err
    finally:
        client.close()


if __name__ == "__main__":
    cmd = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "hostname && uptime"
    code, out, err = run(cmd, 120)
    if out:
        print(out, end="" if out.endswith("\n") else "\n")
    if err:
        print("STDERR:", err, file=sys.stderr)
    print(f"[exit {code}]")
