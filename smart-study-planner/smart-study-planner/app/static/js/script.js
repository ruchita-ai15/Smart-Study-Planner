/**
 * Smart Study Planner - Client-side JavaScript
 * Handles alert auto-dismissal, tooltips, and interactive form aids.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Automatically fade out success alerts after 4 seconds
    const alerts = document.querySelectorAll('.alert-success');
    alerts.forEach((alert) => {
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 4000);
    });

    // Initialize all Bootstrap tooltips if any are present
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map((tooltipTriggerEl) => {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Provide visual feedback when a user submits the "Generate Plan" form
    const generatePlanForm = document.querySelector('form[action*="generate-plan"]');
    if (generatePlanForm) {
        generatePlanForm.addEventListener('submit', (e) => {
            const submitBtn = generatePlanForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Computing Schedule...';
            }
        });
    }
});
