// Fails closed if a Worker upload accidentally takes a Node-only code path.
throw new Error('sharp não pode ser usado no Cloudflare Workers; configure o Images Binding.');
