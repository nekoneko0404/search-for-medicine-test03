/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./**/*.{html,js,ts,jsx,tsx}",
        "!./node_modules/**",
        "!./dist/**"
    ],
    theme: {
        extend: {
            fontFamily: {
                'sans': ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                'rounded': ['"M PLUS Rounded 1c"', 'sans-serif'],
                'pj': ['"Plus Jakarta Sans"', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
