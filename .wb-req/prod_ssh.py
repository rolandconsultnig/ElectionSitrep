"""Minimal SSH helper for the ElectionSitrep production server (66.45.231.142)."""
import sys
import paramiko

HOST = "66.45.231.142"
USER = "root"
PASSWORD = "Samolan123@123@"


def run(cmd, timeout=60):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20, look_for_keys=False, allow_agent=False)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return code, out, err
    finally:
        client.close()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "hostname && uptime"
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    code, out, err = run(cmd, timeout)
    if out:
        print(out, end="" if out.endswith("\n") else "\n")
    if err:
        print("STDERR:", err, file=sys.stderr)
    print(f"[exit {code}]")
