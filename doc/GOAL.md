# Bizbox

**Bizbox is enterprise infrastructure for autonomous AI organizations.** We are building the control plane that enterprise AI companies run on — with the governance, audit trails, and data control that organizations require. Our goal is for Bizbox-powered companies to collectively generate economic output that rivals the GDP of the world's largest countries, doing so with the security and accountability that enterprise environments demand. Every decision we make should serve that: make autonomous companies more capable, more governable, more scalable, and more real.

## The Vision

Autonomous companies — AI workforces organized with real structure, governance, and accountability — will become a major force in the global economy. Not one company. Thousands. Millions. An entire economic layer that runs on AI labor, coordinated through Bizbox.

Bizbox is not the company. Bizbox is what makes the companies possible. We are the control plane, the nervous system, the operating layer. Every autonomous company needs structure, task management, cost control, goal alignment, and human governance. That's us. We are to autonomous companies what the corporate operating system is to human ones — except this time, the operating system is real software, not metaphor.

The measure of our success is not whether one company works. It's whether Bizbox becomes the default enterprise foundation that autonomous companies are built on — and whether those companies, collectively, become a serious economic force that rivals the output of nations.

## The Problem

Task management software doesn't go far enough. When your entire workforce is AI agents, you need more than a to-do list — you need a **control plane** for an entire company. And when that company operates in an enterprise environment, you need the audit trails, governance controls, and data isolation that enterprises require.

## What This Is

Bizbox is the command, communication, and control plane for a company of AI agents. It is the single place where you:

- **Manage agents as employees** — hire, organize, and track who does what
- **Define org structure** — org charts that agents themselves operate within
- **Track work in real time** — see at any moment what every agent is working on
- **Control costs** — token salary budgets per agent, spend tracking, burn rate
- **Align to goals** — agents see how their work serves the bigger mission
- **Store company knowledge** — a shared brain for the organization
- **Maintain compliance** — immutable audit trails for every agent action and board decision
- **Isolate data** — complete company-level data separation in a single deployment

## Architecture

Two layers:

### 1. Control Plane (this software)

The central nervous system. Manages:

- Agent registry and org chart
- Task assignment and status
- Budget and token spend tracking
- Company knowledge base
- Goal hierarchy (company → team → agent → task)
- Heartbeat monitoring — know when agents are alive, idle, or stuck
- Activity audit log — immutable record of every action

### 2. Execution Services (adapters)

Agents run externally and report into the control plane. An agent is just Python code that gets kicked off and does work. Adapters connect different execution environments:

- **OpenClaw** — initial adapter target
- **Heartbeat loop** — simple custom Python that loops, checks in, does work
- **Others** — any runtime that can call an API

The control plane doesn't run agents. It orchestrates them. Agents run wherever they run and phone home.

## Core Principle

You should be able to look at Bizbox and understand your entire company at a glance — who's doing what, how much it costs, whether it's working, and who authorized what.

## Enterprise Principles

- **Self-hosted by default** — your data stays on your infrastructure
- **Audit everything** — every agent action and board decision is durably logged
- **Hard cost controls** — budget limits stop runaway agent spend automatically
- **Data isolation** — company boundaries are enforced at every API layer
- **Governance gates** — approval workflows before agents can hire, spend, or act autonomously
