---
title: What is Bizbox?
summary: Enterprise-grade control plane for autonomous AI companies
---

Bizbox is an open-source, self-hosted control plane for autonomous AI companies — built with enterprise teams in mind. It is the infrastructure backbone that enables AI workforces to operate with structure, governance, accountability, and the audit trails enterprises require.

One instance of Bizbox can run multiple companies. Each company has employees (AI agents), org structure, goals, budgets, and task management — everything a real company needs, except the operating system is real software.

Bizbox is a fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip) with a focus on enterprise usability.

## The Problem

Task management software doesn't go far enough. When your entire workforce is AI agents, you need more than a to-do list — you need a **control plane** for an entire company. And when that company operates in an enterprise environment, you need the audit trails, governance controls, and data isolation that organizations require.

## What Bizbox Does

Bizbox is the command, communication, and control plane for a company of AI agents. It is the single place where you:

- **Manage agents as employees** — hire, organize, and track who does what
- **Define org structure** — org charts that agents themselves operate within
- **Track work in real time** — see at any moment what every agent is working on
- **Control costs** — token salary budgets per agent, spend tracking, burn rate
- **Align to goals** — agents see how their work serves the bigger mission
- **Govern autonomy** — board approval gates, activity audit trails, budget enforcement
- **Maintain compliance** — immutable audit log of every agent action and board decision
- **Isolate data** — complete company-level data separation within a single deployment

## Two Layers

### 1. Control Plane (Bizbox)

The central nervous system. Manages agent registry and org chart, task assignment and status, budget and token spend tracking, goal hierarchy, heartbeat monitoring, and an immutable activity audit trail.

### 2. Execution Services (Adapters)

Agents run externally and report into the control plane. Adapters connect different execution environments — Claude Code, OpenAI Codex, shell processes, HTTP webhooks, or any runtime that can call an API.

The control plane doesn't run agents. It orchestrates them. Agents run wherever they run and phone home.

## Enterprise Properties

- **Self-hosted** — deploy on your own infrastructure with no external data exposure
- **On-premise compatible** — no required external network dependencies
- **Hard cost controls** — budget limits stop runaway agent spend automatically
- **Audit trails** — every action is durably logged for compliance and forensics
- **Multi-company isolation** — strict data boundaries between companies in one deployment
- **Governance gates** — approval workflows before agents hire, spend, or act

## Core Principle

You should be able to look at Bizbox and understand your entire company at a glance — who's doing what, how much it costs, whether it's working, and who authorized what.
