# Mini Program performance and output tooling decision

Scope: Canonical Growth Profile / Resume / Application Projection only.

## Selected now

### 1. One bootstrap request

The growth-record page previously loaded:

- canonical profile;
- resume projection;
- application projection;
- assessment history;
- one or more assessment-preview requests.

The page now uses one `/me/growth-profile/bootstrap` request for its initial data.
The server loads Canonical Profile once and derives all three resume targets plus the
application projection deterministically.

### 2. Native asynchronous WeChat Storage

The page uses `wx.getStorage` / `wx.setStorage` as a small stale-while-revalidate
cache:

- show the most recent local snapshot immediately;
- refresh from the server in the background;
- fresh window: 2 minutes;
- maximum stale fallback: 24 hours;
- cache is scoped by the signed-in Jiuchen user/internal identity;
- canonical writes clear the cache.

Synchronous storage is deliberately avoided on this path.

### 3. Native document delivery

For generated resume files, the preferred client path is:

`HTTPS API -> wx.downloadFile -> wx.openDocument`

This keeps file opening/share/save behavior inside the WeChat ecosystem while the
server remains responsible for deterministic document generation.

## Deliberately not selected yet

### Worker

Not useful for the current bottleneck. Growth Profile is network/DB bound and its
projection logic is small. A Worker would add code/package complexity without
removing round trips.

### Broad subpackage migration / preloadRule

Subpackages can reduce first-package download time, but moving existing routes now
would touch many pages owned by other workstreams. Do this only after package-size
measurement proves startup package download is a material bottleneck.

### CloudBase Storage for every generated resume

CloudBase Storage remains the correct tool for user uploads and durable attachments.
A resume generated from canonical facts is cheap to reproduce, so persisting every
download would create retention/cleanup/privacy work before it provides value.
Durable GeneratedArtifact storage can be added when users need version history.

### Generic browser agent

Not part of this phase. Recruitment adapters consume Application Projection JSON and
must preserve the Human Gate.
