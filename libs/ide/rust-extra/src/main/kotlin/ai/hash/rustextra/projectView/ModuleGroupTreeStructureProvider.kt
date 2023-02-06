package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.DumbAware
import com.intellij.psi.PsiDirectory
import com.intellij.psi.PsiFile

class ModuleGroupTreeStructureProvider : TreeStructureProvider, DumbAware {
    override fun modify(
        parent: AbstractTreeNode<*>,
        children: MutableCollection<AbstractTreeNode<*>>,
        settings: ViewSettings?,
    ): MutableCollection<AbstractTreeNode<*>> {
        val nodes = ArrayList<AbstractTreeNode<*>>()

        val directories = HashMap<String, AbstractTreeNode<PsiDirectory>>()
        val files = HashMap<String, AbstractTreeNode<PsiFile>>()

        // To merge all `module` with their corresponding `module.rs` file we need to do two iterations
        // ... first collect all directories and files via lookup tables
        for (child in children) {
            val value = child.value

            if (value is PsiDirectory) {
                // Statement above checks that this is the case
                @Suppress("UNCHECKED_CAST")
                directories[value.name] = child as AbstractTreeNode<PsiDirectory>
            }

            // all rust files need to end with `.rs`, therefore it is safe to just look for `*.rs` files
            // this way we do not need to require an implicit dependency on the `Rust` plugin to provide us
            // with the correct `value.virtualFile.fileType` value
            // another possibility would be to use `value is RsFile`, but that would require the `Rust` plugin
            // as a direct dependency, this is bad, because that'd mean we would need to update our plugin
            // everytime the rust plugin is updated, with multiple versions etc.
            if (value is PsiFile && value.virtualFile.extension == "rs") {
                // Statement above checks that this is the case
                @Suppress("UNCHECKED_CAST")
                files[value.virtualFile.nameWithoutExtension] = child as AbstractTreeNode<PsiFile>
            }
        }

        // ... then only retain directories that have corresponding files
        val modules = directories
            .filter { (key, _) ->
                files.contains(key)
            }
            .mapValues { (key, value) ->
                Pair(files[key]!!, value)
            }

        for (child in children) {
            val value = child.value

            if (value is PsiDirectory && modules.containsKey(value.name)) {
                continue
            }

            if (value is PsiFile && modules.containsKey(value.virtualFile.nameWithoutExtension)) {
                // we need to add our "special" wrapping `.rs` folder node
                // TODO: add a custom icon
                // TODO: add a custom context menu
                val (file, directory) = modules[value.virtualFile.nameWithoutExtension]!!

                nodes.add(ModuleNode.fromPsiFileNode(file, settings, directory.children))

                continue
            }

            nodes.add(child)
        }

        return nodes
    }
}
