---
title: "Production Kubernetes Debugging with k9s: Shortcuts, Cloud Auth, and Triage Workflows"
slug: "mastering-k9s-kubernetes-terminal-ui-guide"
description: "Connecting k9s to AWS EKS, Azure AKS, and GCP GKE: per-cluster skins, the real config paths, ephemeral debug containers that fail on hardened pods, and read-only hardening."
publishDate: "2026-08-28T10:00:00Z"
author: "Prayash Mishra"
pillar: "running-services"
tags: ["kubernetes", "aws"]
draft: false
---

During a high-severity production outage at 3 AM, every second spent fighting your tooling is a second the system stays down.

Yet, most engineers still triage Kubernetes clusters using raw `kubectl`:

```bash
kubectl get pods -n production | grep order-service
# copy hash: order-service-7d89b94c6f-x92kl
kubectl describe pod order-service-7d89b94c6f-x92kl -n production
kubectl logs -f order-service-7d89b94c6f-x92kl -c app -n production --previous --tail=100
kubectl port-forward svc/order-service 8080:80 -n production
```

Typing long commands, copy-pasting ephemeral UUID hashes, and managing multiple terminals is slow, clunky, and error-prone.

Enter **k9s** — a keyboard-driven TUI for Kubernetes. The same operations become single keystrokes (`l` for logs, `p` for previous logs, `d` for describe, `s` for shell, `Shift+F` for port-forward).

This post covers connecting to **AWS EKS, Azure AKS, and GCP GKE**, multi-cluster context switching, debugging workflows, custom plugins, and the production safety locks — including the two configuration mistakes that stop per-cluster skinning and ephemeral debug containers from working at all.

---

## 1. How k9s Operates Under the Hood

k9s is not a server, agent, or daemon. It does not install anything into your Kubernetes cluster.

Instead, **k9s is a lightweight local Go binary that consumes your existing `~/.kube/config` file**. It communicates with the Kubernetes API Server via client-go with persistent HTTP/2 informers and WebSocket streaming:

```
┌─────────────────────────────────────────────────────────────┐
│ Your Local Machine                                          │
│                                                             │
│  [ k9s Terminal UI ]                                        │
│          │                                                  │
│          ▼ (Reads contexts & tokens)                        │
│  [ ~/.kube/config ]                                         │
│          │                                                  │
└──────────┼──────────────────────────────────────────────────┘
           │
           │ TLS / HTTPS (Kubernetes API REST + WebSockets)
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Cloud Kubernetes API Server                                 │
│  ├── AWS EKS (Amazon Elastic Kubernetes Service)            │
│  ├── Azure AKS (Azure Kubernetes Service)                   │
│  └── GCP GKE (Google Kubernetes Engine)                     │
└─────────────────────────────────────────────────────────────┘
```

Because k9s relies directly on your active kubeconfig, **any cluster you can reach with `kubectl` works out of the box in k9s without special plugins**.

---

## 2. Connecting k9s to Cloud Clusters (AWS, Azure, GCP)

Before launching k9s, you need to populate your `~/.kube/config` with the credentials for your managed cloud clusters.

```
                  ┌───────────────────────────────┐
                  │       ~/.kube/config          │
                  └──────────────┬────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
   [ AWS EKS ]              [ Azure AKS ]           [ GCP GKE ]
aws eks update-kubeconfig  az aks get-credentials  gcloud container clusters
```

### 2.1 Connecting to AWS EKS
1. Ensure the AWS CLI is installed and configured with your IAM credentials:
   ```bash
   aws configure
   ```
2. Pull the cluster context into your kubeconfig with a readable alias:
   ```bash
   aws eks update-kubeconfig \
     --region us-east-1 \
     --name production-eks-cluster \
     --alias eks-prod
   ```
3. Launch k9s directly into that cluster context:
   ```bash
   k9s --context eks-prod
   ```

> **EKS Authentication Tip:** EKS uses the `aws-iam-authenticator` or the native AWS CLI v2 `aws eks get-token` command to generate short-lived bearer tokens. Ensure your AWS IAM role has the `eks:DescribeCluster` permission.

---

### 2.2 Connecting to Azure AKS
1. Log in via the Azure CLI:
   ```bash
   az login
   ```
2. Fetch the credentials for your AKS cluster:
   ```bash
   az aks get-credentials \
     --resource-group rg-production-eastus \
     --name production-aks-cluster \
     --context aks-prod
   ```
3. **If your cluster uses Azure AD / Entra ID authentication**, install `kubelogin` to handle non-interactive browser tokens:
   ```bash
   az aks install-cli
   kubelogin convert-kubeconfig -l azurecli
   ```
4. Launch k9s:
   ```bash
   k9s --context aks-prod
   ```

---

### 2.3 Connecting to Google Cloud GKE
1. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   ```
2. Install the GKE authentication plugin:
   ```bash
   gcloud components install gke-gcloud-auth-plugin
   ```
3. Pull the cluster context:
   ```bash
   gcloud container clusters get-credentials production-gke-cluster \
     --region us-central1 \
     --project my-gcp-production-project
   ```
4. Rename the generated verbose context name to something clean:
   ```bash
   kubectl config rename-context gke_my-gcp-production-project_us-central1_production-gke-cluster gke-prod
   ```
5. Launch k9s:
   ```bash
   k9s --context gke-prod
   ```

---

## 3. Instant Multi-Cluster Switching Inside k9s

Once your kubeconfig contains contexts for your various environments (local minikube, AWS staging, Azure production), **you never need to exit k9s to switch clusters**.

1. Inside k9s, type `:ctx` and hit `Enter`.
2. A list of all available clusters appears.
3. Use the arrow keys (or type `/` to fuzzy search) and hit `Enter` on the desired cluster.
4. To switch namespaces, type `:ns` and hit `Enter` (or press `0` for all namespaces).

```
┌─────────────────────────────────────────────────────────────┐
│ CONTEXTS (Type :ctx)                                        │
│  NAME       CLUSTER              SERVER                     │
│> eks-prod   arn:aws:eks:...      https://xxxxxx.eks.aws     │
│  aks-prod   production-aks-...   https://xxxxxx.azmk8s.io   │
│  gke-prod   gke_project_...      https://35.x.x.x           │
│  k3d-local  k3d-dev-cluster      https://127.0.0.1:6443     │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Production Safety: The Visual "Red Alert" Theme & Read-Only Mode

### 4.1 Visual Skinning by Cluster (Never Drop a Production Table by Mistake)
One of the most dangerous developer errors is deleting a pod or secret thinking you were in the `local` or `staging` cluster, when you were actually in `production`.

k9s supports **per-cluster skins**. You define the skin once, then reference it
from a cluster-specific config file so your production context renders red while
local stays green.

This is a two-file setup, and getting the paths wrong is the usual reason
"per-cluster skinning doesn't work."

**Step 1 — define the skins** in `~/.config/k9s/skins/`:

```yaml
# ~/.config/k9s/skins/prod-alert.yaml
skin: prod-alert
foreground:
  red: "#ff5555"
  bold: true
  invert: false
background:
  black: "#1a0000"
```

```yaml
# ~/.config/k9s/skins/local-calm.yaml
skin: local-calm
foreground:
  green: "#5eead0"
```

**Step 2 — reference the skin per cluster/context.** This file does **not** go
in `~/.config/k9s/`. It goes in k9s' *data* directory, at
`clusters/<cluster>/<context>/config.yaml`:

```yaml
# ~/.local/share/k9s/clusters/eks-prod/eks-prod/config.yaml
k9s:
  cluster: eks-prod
  readOnly: false
  skin: prod-alert       # filename WITHOUT the .yaml extension
  namespace:
    active: production
```

On macOS the data directory is under `~/Library/Application Support/k9s/`, and
if you set `XDG_DATA_HOME` it moves again. **Run `k9s info` and read the paths
it prints** rather than assuming — this is the single most common reason a
config file appears to be ignored.

Note the flat shape: `skin` is a sibling of `cluster` and `namespace`, not a
nested per-cluster object in the main config. A `k9s.clusters.<name>.skin`
block in `~/.config/k9s/config.yaml` is not a schema k9s reads, and it fails
silently — k9s starts, looks fine, and simply uses the default skin.

**Global fallback** goes in the main config, so an unrecognised context is at
least visually neutral rather than alarming:

```yaml
# ~/.config/k9s/config.yaml
k9s:
  refreshRate: 2
  ui:
    enableMouse: false
    skin: local-calm
```

**Quick override** for a one-off session, without touching any file:

```bash
K9S_SKIN=prod-alert k9s --context eks-prod
```

⚠️ **A skin is a guardrail, not a control.** It is one line of colour in a
terminal that scrolled past an hour ago. It does not stop a `kubectl delete`.
Pair it with §4.2 and treat the skin as a second signal, never the only one.

### 4.2 Hardening with Read-Only Mode
In k9s, pressing `Ctrl+D` immediately sends a `DELETE` API call to terminate a pod, and `e` opens the live YAML manifest in `vim`.

To guarantee you never accidentally kill workloads during an audit or triage session, run k9s in **Read-Only Mode**:

```bash
k9s --context eks-prod --readonly
```

In read-only mode, all modification hotkeys (`Ctrl+D`, `e`, `edit`, `scale`) are strictly disabled in the UI.

Read-only mode stops accidents at the UI. It does not stop them at the API
server, and it does not apply to a `kubectl` you type in another terminal. If
the blast radius justifies it, the real control is RBAC — a context whose
credentials cannot `delete` pods cannot delete your pods, no matter which tool
you are holding.

---

## 5. Senior Debugging Workflows & Hotkeys

The operations that carry their weight during live troubleshooting:

### 1. Instant Pod Port-Forwarding (`Shift + F`)
Stop writing `kubectl port-forward svc/my-redis 6379:6379`.
* Highlight any Pod or Service in k9s.
* Press `Shift + F`.
* A dialog opens with the container port pre-filled. Enter your desired local port (e.g., `6379`) and hit `Enter`.
* View and manage all active background port-forwards anytime by typing `:pf`.

### 2. Inspecting Dead Containers with Previous Logs (`p`)
When a container is caught in a `CrashLoopBackOff`, pressing `l` (Logs) shows an empty screen or the latest boot logs because the container just restarted seconds ago.
* Press `p` inside the log view to toggle `--previous`.
* k9s instantly retrieves the stdout/stderr stream from the **terminated container instance immediately prior to the crash**, revealing the fatal uncaught exception or OOM event.

### 3. Dropping into Containers (`s`)
* Highlight any running pod and press `s`.
* k9s automatically launches an interactive `/bin/sh` or `/bin/bash` terminal session inside the container.
* If the pod has multiple containers, k9s prompts you with a clean selection menu.

### 4. Visualizing Dependencies with X-Ray (`:xray`)
Need to see how an Ingress routes through Services to target Pods?
* Type `:xray pods` or `:xray svc` to render a real-time ASCII dependency graph mapping relationships and health across resources.

---

## 6. Extending k9s with Custom Plugins (`plugin.yaml`)

k9s allows you to attach custom bash and `kubectl` commands to custom hotkeys.

Create `~/.config/k9s/plugins.yaml`:

```yaml
# ~/.config/k9s/plugins.yaml
plugin:
  # 1. Press Shift+R on any Deployment to trigger a zero-downtime rolling restart
  rollout-restart:
    shortCut: Shift-R
    confirm: true
    description: "Rollout Restart"
    scopes:
      - deployments
      - daemonsets
      - statefulsets
    command: kubectl
    background: false
    args:
      - rollout
      - restart
      - $RESOURCE_NAME
      - -n
      - $NAMESPACE
      - --context
      - $CONTEXT

  # 2. Press Shift+D to attach an ephemeral debug container with network diagnostics
  debug-container:
    shortCut: Shift-D
    confirm: true
    description: "Inject Netshoot Debug Container"
    scopes:
      - pods
    command: kubectl
    background: false
    args:
      - debug
      - -it
      - $NAME
      - -n
      - $NAMESPACE
      - --image=nicolaka/netshoot
      - --target=$NAME
```

With these two plugins installed:
* Selecting an application deployment and pressing `Shift+R` instantly triggers a rolling restart.
* Selecting a locked-down, distroless container and pressing `Shift+D` injects a temporary `nicolaka/netshoot` container equipped with `curl`, `tcpdump`, `dig`, and `netstat` right into the pod's network namespace!

### ⚠️ Pitfall: Ephemeral Containers Need a SecurityContext That Most Pods Do Not Have

`kubectl debug --image=nicolaka/netshoot` attaches an ephemeral container to a
running pod. Two things routinely stop this from working, and neither produces
an error that points at the real cause.

**1. Distroless pods have no shell to begin with.** That is the reason you
reached for netshoot in the first place, but it also means nothing is listening
on the target's stdin. The injected container will start and immediately exit,
and you get a session that blinks and closes. Fix: pass `--target` to a
container that *does* have a shell, or drop `--target` and attach to the
ephemeral container's own namespace.

**2. Ephemeral containers inherit the pod's `securityContext`, and hardened
pods will refuse netshoot outright.** This is the common one. A pod with:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

cannot host `nicolaka/netshoot`, which needs `NET_ADMIN` and `NET_RAW` for
`tcpdump` and a writable root filesystem for its tooling. The API server
rejects the ephemeral container, and kubectl reports something closer to
`cannot create ephemeral container` than "your pod drops all capabilities."

**Symptom → cause → fix:** ephemeral container fails to start on hardened pods
only, while working fine on staging → the pod's `securityContext` drops the
capabilities netshoot needs → either add the specific capabilities to the pod,
or (better) stop using netshoot and reach for a purpose-built debug image with a
static `nonroot` user and no capabilities requirement.

The general lesson, and it applies well beyond this plugin: **a debugging tool
that needs privileges will not work in the environment you most need to debug.**
Plan for that before the incident, because retrofitting `NET_ADMIN` onto a
hardened pod is its own outage.

---

## 7. The Essential k9s Hotkey Cheatsheet

| Keybinding | Context | Action |
| :--- | :--- | :--- |
| `:pods`, `:deploy`, `:svc` | Navigation | Switch to view Pods, Deployments, or Services |
| `:ctx` | Navigation | Switch between Kubernetes clusters (EKS, AKS, GKE, local) |
| `:ns` | Navigation | Switch namespaces (`0` for all namespaces) |
| `/` | Any view | Filter resources by regex / fuzzy name |
| `l` | Pod / Container | Stream live container logs |
| `p` | Log view | Toggle previous logs (`--previous`) for crashed pods |
| `s` | Pod | Drop into an interactive shell (`/bin/sh` or `/bin/bash`) |
| `d` | Any resource | Describe resource (`kubectl describe`) |
| `y` | Any resource | View clean YAML configuration |
| `Shift + F` | Pod / Service | Create background port-forward (`:pf` to manage) |
| `Ctrl + D` | Any resource | Delete resource (disabled in `--readonly`) |
| `Ctrl + Z` | Pod view | Toggle display of error-state pods only |

---

## Summary

`kubectl` is right for CI/CD and for anything that should be reproducible from
a file. It is the wrong tool for a human mid-incident, because it makes you
retype what you already know and shows you one object at a time.

k9s is faster once it is configured — and "configured" is doing real work in
this post. The parts that matter are not the hotkeys, they are:

* **Per-cluster skins** so a production context cannot be mistaken for local.
  Verify the paths with `k9s info`; a misplaced config file is ignored silently.
* **`--readonly`** for any session where you might be tired.
* **RBAC underneath both**, because a UI guardrail is not an authorization boundary.
* **Plugins you have tested against your actual securityContext**, because the
  environments that need debugging most are the ones least likely to accept a
  privileged debug container.

The tool does not make you faster on its own. A `kubectl` command you have
muscle memory for will beat an unconfigured k9s every time.
