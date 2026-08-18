output "project_subdomain" {
  description = "Cloudflare Pages project subdomain"
  value       = "${cloudflare_pages_project.main.name}.pages.dev"
}
